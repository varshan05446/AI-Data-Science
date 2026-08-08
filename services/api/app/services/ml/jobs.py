"""Background training-job executor.

Runs the existing AutoML engine on a daemon thread with its own database
session, so a "Predict Best Model" click returns immediately and training
survives any UI navigation. Progress, stage and logs stream into the
:class:`TrainingJob` row, which the frontend polls; the finished run is stored
as a normal :class:`ModelRun` so all existing result/playground endpoints keep
working unchanged.
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import Dataset, ModelRun, TrainingJob
from app.services.dataset_io import read_dataset_dataframe
from app.services.ml.artifacts import save_artifact
from app.services.ml.automl import AutoMLError, train_and_evaluate
from app.services.ml.tasks_extra import train_clustering, train_timeseries

_MAX_LOGS = 200

# Job ids currently executing inside *this* process. Used to detect jobs left
# "running" by a previous process (server restart) so they can be failed
# instead of appearing alive forever.
_RUNNING: set[str] = set()
_LOCK = threading.Lock()


def compute_config_hash(dataset: Dataset, config: dict[str, Any]) -> str:
    """Stable hash of dataset identity/version + training configuration.

    Includes the dataset's updated timestamp so re-uploading or cleaning the
    data invalidates cached results, per "never retrain unless the dataset or
    prediction configuration changes".
    """
    stamp = ""
    updated = getattr(dataset, "updated_at", None)
    if updated is not None:
        stamp = updated.isoformat()
    payload = json.dumps(
        {"dataset": dataset.id, "version": stamp, "config": config},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


def is_running_here(job_id: str) -> bool:
    with _LOCK:
        return job_id in _RUNNING


def reconcile_job(db, job: TrainingJob) -> TrainingJob:
    """Fail jobs orphaned by a server restart (status says active, no thread)."""
    if job.status in ("queued", "running") and not is_running_here(job.id):
        # Give a freshly queued job a moment to enter the registry.
        age = (datetime.now(timezone.utc) - job.created_at.replace(tzinfo=timezone.utc)).total_seconds()
        if age > 15:
            job.status = "failed"
            job.error = "Training was interrupted by a server restart. Please start a new run."
            job.stage = "failed"
            db.commit()
            db.refresh(job)
    return job


def launch_training_job(job_id: str) -> None:
    """Start the training thread for a queued job (idempotent)."""
    with _LOCK:
        if job_id in _RUNNING:
            return
        _RUNNING.add(job_id)
    thread = threading.Thread(
        target=_run_job, args=(job_id,), name=f"training-job-{job_id[:8]}", daemon=True
    )
    thread.start()


def _run_job(job_id: str) -> None:
    db = SessionLocal()
    try:
        job = db.scalar(select(TrainingJob).where(TrainingJob.id == job_id))
        if job is None or job.status not in ("queued", "running"):
            return
        dataset = db.scalar(select(Dataset).where(Dataset.id == job.dataset_id))
        if dataset is None:
            _finish(db, job, error="Dataset no longer exists.")
            return

        state = {"last_commit": 0.0, "logs": list(job.logs or [])}

        def update(progress: float, stage: str, message: str | None = None) -> None:
            """Persist job progress; throttled so SQLite isn't hammered."""
            job.progress = round(max(job.progress, min(99.0, progress)), 1)
            job.stage = stage
            if message:
                state["logs"].append(
                    {
                        "ts": datetime.now(timezone.utc).isoformat(),
                        "stage": stage,
                        "message": message,
                    }
                )
                state["logs"] = state["logs"][-_MAX_LOGS:]
                job.logs = list(state["logs"])
            now = time.monotonic()
            if message or now - state["last_commit"] > 0.5:
                state["last_commit"] = now
                try:
                    db.commit()
                except Exception:  # noqa: BLE001 - progress writes are best-effort
                    db.rollback()

        job.status = "running"
        job.stage = "starting"
        update(1.0, "starting", "Training job started.")

        config = dict(job.config or {})
        try:
            df = read_dataset_dataframe(dataset)
        except Exception as exc:  # noqa: BLE001
            _finish(db, job, error=f"Could not read dataset file: {exc}")
            return

        update(3.0, "load", f"Loaded dataset: {len(df):,} rows x {len(df.columns)} columns.")

        capture: dict[str, Any] = {}
        task = config.get("task")
        try:
            if task == "clustering":
                update(10.0, "train", "Running clustering algorithms…")
                result = train_clustering(df, model_keys=config.get("model_keys"))
                update(90.0, "explain", "Clustering complete. Preparing results…")
            elif task == "timeseries":
                update(10.0, "train", "Fitting time-series baselines…")
                result = train_timeseries(df, config.get("target", ""))
                update(90.0, "explain", "Forecast baselines complete. Preparing results…")
            else:
                eff_task = task if task in ("classification", "regression") else None

                def progress_cb(frac: float, stage: str, message: str | None) -> None:
                    # Engine fraction 0..1 maps onto the 5-95% band of the job.
                    update(5.0 + frac * 90.0, stage, message)

                result = train_and_evaluate(
                    df,
                    config.get("target", ""),
                    task=eff_task,  # type: ignore[arg-type]
                    model_keys=config.get("model_keys"),
                    test_size=config.get("test_size", 0.2),
                    tune=bool(config.get("tune") or config.get("optimize")),
                    n_trials=config.get("n_trials", 20),
                    include_models=config.get("include_models"),
                    features=config.get("features"),
                    cv_folds=config.get("cv_folds", 3),
                    random_state=config.get("random_state"),
                    hyperparameters=config.get("hyperparameters"),
                    ensemble=config.get("ensemble"),
                    fitting=config.get("fitting"),
                    capture=capture,
                    progress_cb=progress_cb,
                )
        except AutoMLError as exc:
            _finish(db, job, error=str(exc))
            return
        except Exception as exc:  # noqa: BLE001 - never leave a job stuck
            _finish(db, job, error=f"Training failed unexpectedly: {exc}")
            return

        if config.get("objective_id"):
            result["objective_id"] = config["objective_id"]

        update(96.0, "save", "Saving model run…")
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
        pipe = capture.get("pipeline")
        if pipe is not None:
            try:
                key = save_artifact(pipe, run.id, dataset.workspace_id)
                run.result = {**run.result, "artifact_key": key}
                db.commit()
            except Exception:  # noqa: BLE001 - results are saved even if this fails
                db.rollback()

        job.model_run_id = run.id
        _finish(
            db,
            job,
            message=f"Training complete — best model: {best['label']} "
            f"({primary}={float(best['metrics'].get(primary, 0.0)):.4f}).",
        )
    finally:
        with _LOCK:
            _RUNNING.discard(job_id)
        db.close()


def _finish(db, job: TrainingJob, *, error: str = "", message: str = "") -> None:
    logs = list(job.logs or [])
    logs.append(
        {
            "ts": datetime.now(timezone.utc).isoformat(),
            "stage": "failed" if error else "done",
            "message": error or message or "Job finished.",
        }
    )
    job.logs = logs[-_MAX_LOGS:]
    if error:
        job.status = "failed"
        job.stage = "failed"
        job.error = error
    else:
        job.status = "succeeded"
        job.stage = "done"
        job.progress = 100.0
    try:
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
