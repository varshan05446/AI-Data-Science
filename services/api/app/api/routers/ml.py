"""AutoML "Predict Best Model" endpoints.

Config surfaces the columns, target suggestions and available algorithms so the
UI can drive a one-click experience. Training runs the AutoML engine, persists a
:class:`ModelRun`, and returns the full ranked leaderboard + winner explanation.
Past runs are retrievable without re-training.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentAuth, require_role
from app.api.resources import get_owned_dataset
from app.core.database import get_db
from app.models import Dataset, ModelRun, ProfileReport, TrainingJob
from app.models.base import Role
from app.schemas import (
    ModelConfigOut,
    ModelPredictOut,
    ModelPredictRequest,
    ModelRunOut,
    ModelRunSummary,
    ModelTrainRequest,
    TrainingJobOut,
)
from app.services.data.profiling import profile_dataframe
from app.services.dataset_io import read_dataset_dataframe
from app.services.ml.artifacts import load_artifact, predict_with_artifact, save_artifact
from app.services.ml.automl import AutoMLError, train_and_evaluate
from app.services.ml.discovery import scan_target_signals
from app.services.ml.jobs import compute_config_hash, launch_training_job, reconcile_job
from app.services.ml.objectives import build_objectives, dataset_ml_summary
from app.services.ml.registry import available_models, optional_capabilities
from app.services.ml.reinforcement import available_reinforcement, train_reinforcement
from app.services.ml.semisupervised import available_semisupervised, train_semisupervised
from app.services.ml.tasks_extra import train_clustering, train_timeseries

router = APIRouter(tags=["models"])

_WRITE_ROLES = (Role.OWNER, Role.DATA_SCIENTIST, Role.ANALYST)


def _read_df(dataset: Dataset):
    try:
        return read_dataset_dataframe(dataset)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not read dataset file: {exc}",
        ) from exc


def _models_by_task() -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {
        "classification": [],
        "regression": [],
        "clustering": [],
    }
    for spec in available_models():
        out.setdefault(spec.task, []).append(
            {"key": spec.key, "label": spec.label, "tags": spec.tags}
        )
    # Non-sklearn model families live outside the sklearn registry.
    out["semi_supervised"] = available_semisupervised()
    out["reinforcement"] = available_reinforcement()
    return out


@router.get("/datasets/{dataset_id}/models/config", response_model=ModelConfigOut)
def model_config(
    dataset: Dataset = Depends(get_owned_dataset), db: Session = Depends(get_db)
) -> ModelConfigOut:
    """Columns, target suggestions and available algorithms for the UI."""
    report_row = db.scalar(
        select(ProfileReport).where(ProfileReport.dataset_id == dataset.id)
    )
    report = report_row.report if report_row else profile_dataframe(_read_df(dataset))

    columns = [
        {
            "name": c["name"],
            "semantic_type": c["semantic_type"],
            "unique": c["unique"],
            "missing_pct": c["missing_pct"],
        }
        for c in report.get("columns", [])
    ]
    return ModelConfigOut(
        dataset_id=dataset.id,
        columns=columns,
        target_suggestions=report.get("target_suggestions", []),
        models=_models_by_task(),
        capabilities=optional_capabilities(),
        objectives=build_objectives(report),
        summary=dataset_ml_summary(report),
    )


@router.get(
    "/datasets/{dataset_id}/models/signal-scan",
    response_model=list[dict[str, Any]],
)
def signal_scan(
    dataset: Dataset = Depends(get_owned_dataset),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Rank every viable target by its achievable prediction score.

    Runs a fast, capped AutoML evaluation per target column and reports the
    honest ceiling (hold-out + cross-validated). Targets whose high accuracy
    comes from a derived-column tautology (e.g. ``unit_price ≈ revenue / units``)
    are flagged ``leaky`` so users can tell a real signal from an arithmetic
    artifact. Synchronous is fine: one cheap RandomForest per target.
    """
    df = _read_df(dataset)
    return scan_target_signals(df)


@router.post(
    "/datasets/{dataset_id}/models/train",
    response_model=ModelRunOut,
    status_code=status.HTTP_201_CREATED,
)
def train_models(
    body: ModelTrainRequest,
    dataset: Dataset = Depends(get_owned_dataset),
    auth: CurrentAuth = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
) -> ModelRunOut:
    df = _read_df(dataset)
    capture: dict[str, Any] = {}
    try:
        if body.task == "clustering":
            result = train_clustering(
                df,
                model_keys=body.model_keys,
                n_clusters=body.n_clusters,
                features=body.features,
                scaling=(body.fitting or {}).get("scaling") or "standard",
                encoding=(body.fitting or {}).get("encoding") or "onehot",
                linkage=body.linkage,
                random_state=body.random_state,
            )
        elif body.task == "timeseries":
            result = train_timeseries(df, body.target)
        elif body.task == "semi_supervised":
            result = train_semisupervised(
                df,
                body.target,
                model_keys=body.model_keys,
                features=body.features,
                test_size=body.test_size,
                random_state=body.random_state,
                threshold=body.threshold or 0.75,
                base_estimator=body.base_estimator or "logistic_regression",
                capture=capture,
            )
        elif body.task == "reinforcement":
            result = train_reinforcement(
                df,
                target=body.target,
                model_keys=body.model_keys,
                features=body.features,
                random_state=body.random_state,
                gamma=body.gamma,
                alpha=body.alpha,
                max_iterations=body.max_iterations,
                threshold=body.threshold,
                n_bins=body.n_bins,
            )
        else:
            task = body.task if body.task in ("classification", "regression") else None
            result = train_and_evaluate(
                df,
                body.target,
                task=task,  # type: ignore[arg-type]
                model_keys=body.model_keys,
                test_size=body.test_size,
                tune=body.tune or body.optimize,
                n_trials=body.n_trials,
                include_models=body.include_models,
                features=body.features,
                cv_folds=body.cv_folds,
                random_state=body.random_state,
                hyperparameters=body.hyperparameters,
                ensemble=body.ensemble,
                fitting=body.fitting,
                capture=capture,
            )
    except AutoMLError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    if body.objective_id:
        result["objective_id"] = body.objective_id

    best = result["best"]
    primary = result["primary_metric"]
    run = ModelRun(
        dataset_id=dataset.id,
        workspace_id=dataset.workspace_id,
        target=result["target"],
        task=result["task"],
        best_model_key=best["key"],
        best_model_label=best["label"],
        primary_metric=primary,
        primary_score=float(best["metrics"].get(primary, 0.0)),
        result=result,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Persist the winning pipeline so the Playground can serve predictions.
    # Best-effort: training results are already saved even if this fails.
    pipe = capture.get("pipeline")
    if pipe is not None:
        try:
            key = save_artifact(pipe, run.id, dataset.workspace_id)
            run.result = {**run.result, "artifact_key": key}
            db.commit()
            db.refresh(run)
        except Exception:  # noqa: BLE001
            db.rollback()
    return ModelRunOut.model_validate(run)


def _job_out(job: TrainingJob) -> TrainingJobOut:
    return TrainingJobOut.model_validate(job)


@router.post(
    "/datasets/{dataset_id}/models/train-async",
    response_model=TrainingJobOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def train_models_async(
    body: ModelTrainRequest,
    dataset: Dataset = Depends(get_owned_dataset),
    auth: CurrentAuth = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
) -> TrainingJobOut:
    """Start (or reconnect to) a background training job.

    * An active job on this dataset is returned as-is so the UI reconnects
      instead of launching a duplicate.
    * A finished job with the identical dataset version + configuration is
      returned from cache — nothing retrains unless ``force`` is set or the
      dataset/config changed.
    """
    config = body.model_dump(exclude={"force"}, exclude_none=True)
    config_hash = compute_config_hash(dataset, config)

    # Reconnect to any live job on this dataset (regardless of config): one
    # dataset trains one job at a time.
    active = db.scalars(
        select(TrainingJob)
        .where(
            TrainingJob.dataset_id == dataset.id,
            TrainingJob.status.in_(("queued", "running")),
        )
        .order_by(TrainingJob.created_at.desc())
    ).all()
    for job in active:
        job = reconcile_job(db, job)
        if job.status in ("queued", "running"):
            return _job_out(job)

    # Cached result for the exact same dataset version + config.
    if not body.force:
        cached = db.scalar(
            select(TrainingJob)
            .where(
                TrainingJob.dataset_id == dataset.id,
                TrainingJob.config_hash == config_hash,
                TrainingJob.status == "succeeded",
                TrainingJob.model_run_id.is_not(None),
            )
            .order_by(TrainingJob.created_at.desc())
        )
        if cached is not None:
            run_exists = db.scalar(
                select(ModelRun.id).where(ModelRun.id == cached.model_run_id)
            )
            if run_exists:
                return _job_out(cached)

    job = TrainingJob(
        dataset_id=dataset.id,
        workspace_id=dataset.workspace_id,
        status="queued",
        progress=0.0,
        stage="queued",
        logs=[],
        config=config,
        config_hash=config_hash,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    launch_training_job(job.id)
    return _job_out(job)


@router.get("/datasets/{dataset_id}/models/jobs", response_model=list[TrainingJobOut])
def list_training_jobs(
    active: bool = False,
    dataset: Dataset = Depends(get_owned_dataset),
    db: Session = Depends(get_db),
) -> list[TrainingJobOut]:
    """Recent training jobs for this dataset; ``?active=true`` for reconnect."""
    stmt = (
        select(TrainingJob)
        .where(TrainingJob.dataset_id == dataset.id)
        .order_by(TrainingJob.created_at.desc())
        .limit(20)
    )
    jobs = [reconcile_job(db, j) for j in db.scalars(stmt).all()]
    if active:
        jobs = [j for j in jobs if j.status in ("queued", "running")]
    return [_job_out(j) for j in jobs]


@router.get(
    "/datasets/{dataset_id}/models/jobs/{job_id}", response_model=TrainingJobOut
)
def get_training_job(
    job_id: str,
    dataset: Dataset = Depends(get_owned_dataset),
    db: Session = Depends(get_db),
) -> TrainingJobOut:
    job = db.scalar(
        select(TrainingJob).where(
            TrainingJob.id == job_id, TrainingJob.dataset_id == dataset.id
        )
    )
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Training job not found"
        )
    return _job_out(reconcile_job(db, job))


@router.get("/datasets/{dataset_id}/models/runs", response_model=list[ModelRunSummary])
def list_runs(
    dataset: Dataset = Depends(get_owned_dataset), db: Session = Depends(get_db)
) -> list[ModelRunSummary]:
    runs = db.scalars(
        select(ModelRun)
        .where(ModelRun.dataset_id == dataset.id)
        .order_by(ModelRun.created_at.desc())
    ).all()
    return [ModelRunSummary.model_validate(r) for r in runs]


@router.get(
    "/datasets/{dataset_id}/models/runs/{run_id}", response_model=ModelRunOut
)
def get_run(
    run_id: str,
    dataset: Dataset = Depends(get_owned_dataset),
    db: Session = Depends(get_db),
) -> ModelRunOut:
    run = db.scalar(
        select(ModelRun).where(
            ModelRun.id == run_id, ModelRun.dataset_id == dataset.id
        )
    )
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Model run not found"
        )
    return ModelRunOut.model_validate(run)


@router.post(
    "/datasets/{dataset_id}/models/runs/{run_id}/predict",
    response_model=ModelPredictOut,
)
def predict_with_run(
    run_id: str,
    body: ModelPredictRequest,
    dataset: Dataset = Depends(get_owned_dataset),
    auth: CurrentAuth = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
) -> ModelPredictOut:
    """Playground inference: run one prediction with a stored model artifact."""
    run = db.scalar(
        select(ModelRun).where(
            ModelRun.id == run_id, ModelRun.dataset_id == dataset.id
        )
    )
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Model run not found"
        )
    result = run.result or {}
    key = result.get("artifact_key")
    schema = result.get("input_schema") or []
    if not key or not schema:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "This run has no stored model artifact. Re-train the model to "
                "enable Playground predictions."
            ),
        )
    try:
        pipe = load_artifact(key)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored model artifact was not found. Re-train the model.",
        ) from exc

    try:
        pred = predict_with_artifact(
            pipe, schema, body.inputs, run.task, result.get("classes")
        )
    except Exception as exc:  # noqa: BLE001 - surface as a user-correctable error
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Prediction failed: {exc}",
        ) from exc

    importance = (result.get("best", {}).get("feature_importance") or [])[:3]
    drivers = [
        {"feature": f["feature"], "importance": f.get("importance", 0)}
        for f in importance
    ]
    if run.task in ("classification", "semi_supervised"):
        explanation = (
            f"{run.best_model_label} predicts '{pred['prediction']}'"
            + (
                f" with {pred['confidence']:.0%} confidence"
                if pred.get("confidence") is not None
                else ""
            )
            + "."
        )
    else:
        explanation = (
            f"{run.best_model_label} estimates {run.target} at {pred['prediction']}."
        )
    if drivers:
        explanation += (
            " This prediction is driven mostly by "
            + ", ".join(d["feature"] for d in drivers)
            + "."
        )

    return ModelPredictOut(
        prediction=pred["prediction"],
        probabilities=pred.get("probabilities"),
        confidence=pred.get("confidence"),
        explanation=explanation,
        top_drivers=drivers,
    )
