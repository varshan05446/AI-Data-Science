"""Data-cleaning workspace endpoints.

A reproducible, non-destructive cleaning pipeline per dataset. Operations are
appended to an ordered pipeline that is replayed over the dataset's *original*
file to derive the working preview, so undo/redo/version-history are cheap and
never mutate the source. Committing produces a brand-new cleaned dataset in the
same project (like Power Query's "Close & Load"), which then flows through the
rest of the app (profile, EDA, notebook, models) unchanged.
"""
from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentAuth, require_role
from app.api.resources import get_owned_dataset
from app.core.database import get_db
from app.models import CleaningSession, Dataset, ProfileReport
from app.models.base import DatasetStatus, Role
from app.schemas import (
    CleaningApplyRequest,
    CleaningCommitRequest,
    CleaningStateOut,
    CleaningVersionRequest,
    DatasetOut,
)
from app.services.data.profiling import profile_dataframe
from app.services.data.transforms import (
    TransformError,
    apply_operation,
    apply_pipeline,
    describe_step,
    grid_preview,
    operation_catalog,
)
from app.services.dataset_io import read_dataset_dataframe
from app.services.storage import get_storage

router = APIRouter(tags=["cleaning"])

_WRITE_ROLES = (Role.OWNER, Role.DATA_SCIENTIST, Role.ANALYST)


# --- Helpers ------------------------------------------------------------------


def _get_or_create_session(db: Session, dataset: Dataset) -> CleaningSession:
    session = db.scalar(
        select(CleaningSession).where(CleaningSession.dataset_id == dataset.id)
    )
    if session is None:
        session = CleaningSession(
            dataset_id=dataset.id,
            workspace_id=dataset.workspace_id,
            steps=[],
            redo_stack=[],
            versions=[],
        )
        db.add(session)
        db.flush()
    return session


def _base_df(dataset: Dataset) -> pd.DataFrame:
    try:
        return read_dataset_dataframe(dataset)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not read dataset file: {exc}",
        ) from exc


def _working_df(dataset: Dataset, session: CleaningSession) -> pd.DataFrame:
    """Replay the pipeline over the original file to get the working DataFrame."""
    df = _base_df(dataset)
    return apply_pipeline(df, list(session.steps or []))


def _state(
    dataset: Dataset,
    session: CleaningSession,
    df: pd.DataFrame,
    error: str | None = None,
) -> CleaningStateOut:
    return CleaningStateOut(
        dataset_id=dataset.id,
        preview=grid_preview(df),
        steps=list(session.steps or []),
        versions=[
            {k: v for k, v in ver.items() if k != "steps"}
            for ver in (session.versions or [])
        ],
        can_undo=bool(session.steps),
        can_redo=bool(session.redo_stack),
        error=error,
    )


def _step_record(spec: dict[str, Any]) -> dict[str, Any]:
    """Augment an op spec with a stable id + human label for the UI."""
    return {
        "id": uuid.uuid4().hex,
        "op": spec.get("op"),
        "column": spec.get("column"),
        "params": spec.get("params") or {},
        "label": describe_step(spec),
    }


# --- Read ---------------------------------------------------------------------


@router.get("/datasets/{dataset_id}/cleaning/operations")
def list_operations(dataset: Dataset = Depends(get_owned_dataset)) -> dict[str, Any]:
    """Return the grouped operation catalogue so the UI can render menus."""
    return {"catalog": operation_catalog()}


@router.get("/datasets/{dataset_id}/cleaning/state", response_model=CleaningStateOut)
def get_cleaning_state(
    dataset: Dataset = Depends(get_owned_dataset), db: Session = Depends(get_db)
) -> CleaningStateOut:
    session = _get_or_create_session(db, dataset)
    df = _working_df(dataset, session)
    db.commit()
    return _state(dataset, session, df)


# --- Mutations ----------------------------------------------------------------


@router.post("/datasets/{dataset_id}/cleaning/apply", response_model=CleaningStateOut)
def apply_cleaning_operation(
    body: CleaningApplyRequest,
    dataset: Dataset = Depends(get_owned_dataset),
    auth: CurrentAuth = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
) -> CleaningStateOut:
    session = _get_or_create_session(db, dataset)
    df = _working_df(dataset, session)

    spec = {"op": body.op, "column": body.column, "params": body.params}
    try:
        new_df = apply_operation(df, spec)
    except TransformError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    session.steps = list(session.steps or []) + [_step_record(spec)]
    session.redo_stack = []  # a new action invalidates the redo stack
    db.commit()
    return _state(dataset, session, new_df)


@router.post("/datasets/{dataset_id}/cleaning/undo", response_model=CleaningStateOut)
def undo(
    dataset: Dataset = Depends(get_owned_dataset),
    auth: CurrentAuth = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
) -> CleaningStateOut:
    session = _get_or_create_session(db, dataset)
    steps = list(session.steps or [])
    if not steps:
        df = _working_df(dataset, session)
        return _state(dataset, session, df, error="Nothing to undo.")
    popped = steps.pop()
    session.steps = steps
    session.redo_stack = list(session.redo_stack or []) + [popped]
    df = _working_df(dataset, session)
    db.commit()
    return _state(dataset, session, df)


@router.post("/datasets/{dataset_id}/cleaning/redo", response_model=CleaningStateOut)
def redo(
    dataset: Dataset = Depends(get_owned_dataset),
    auth: CurrentAuth = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
) -> CleaningStateOut:
    session = _get_or_create_session(db, dataset)
    redo_stack = list(session.redo_stack or [])
    if not redo_stack:
        df = _working_df(dataset, session)
        return _state(dataset, session, df, error="Nothing to redo.")
    restored = redo_stack.pop()
    session.redo_stack = redo_stack
    session.steps = list(session.steps or []) + [restored]
    df = _working_df(dataset, session)
    db.commit()
    return _state(dataset, session, df)


@router.post("/datasets/{dataset_id}/cleaning/reset", response_model=CleaningStateOut)
def reset(
    dataset: Dataset = Depends(get_owned_dataset),
    auth: CurrentAuth = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
) -> CleaningStateOut:
    session = _get_or_create_session(db, dataset)
    session.steps = []
    session.redo_stack = []
    df = _base_df(dataset)
    db.commit()
    return _state(dataset, session, df)


# --- Versions -----------------------------------------------------------------


@router.post("/datasets/{dataset_id}/cleaning/versions", response_model=CleaningStateOut)
def save_version(
    body: CleaningVersionRequest,
    dataset: Dataset = Depends(get_owned_dataset),
    auth: CurrentAuth = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
) -> CleaningStateOut:
    session = _get_or_create_session(db, dataset)
    version = {
        "id": uuid.uuid4().hex,
        "label": body.label or "Snapshot",
        "steps": list(session.steps or []),
        "step_count": len(session.steps or []),
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    session.versions = list(session.versions or []) + [version]
    df = _working_df(dataset, session)
    db.commit()
    return _state(dataset, session, df)


@router.post(
    "/datasets/{dataset_id}/cleaning/versions/{version_id}/restore",
    response_model=CleaningStateOut,
)
def restore_version(
    version_id: str,
    dataset: Dataset = Depends(get_owned_dataset),
    auth: CurrentAuth = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
) -> CleaningStateOut:
    session = _get_or_create_session(db, dataset)
    version = next(
        (v for v in (session.versions or []) if v.get("id") == version_id), None
    )
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Version not found"
        )
    session.steps = list(version.get("steps") or [])
    session.redo_stack = []
    df = _working_df(dataset, session)
    db.commit()
    return _state(dataset, session, df)


# --- Commit -------------------------------------------------------------------


@router.post(
    "/datasets/{dataset_id}/cleaning/commit",
    response_model=DatasetOut,
    status_code=status.HTTP_201_CREATED,
)
def commit_cleaning(
    body: CleaningCommitRequest,
    dataset: Dataset = Depends(get_owned_dataset),
    auth: CurrentAuth = Depends(require_role(Role.OWNER, Role.DATA_SCIENTIST, Role.ANALYST)),
    db: Session = Depends(get_db),
) -> DatasetOut:
    """Materialise the cleaned pipeline as a NEW dataset in the same project."""
    session = _get_or_create_session(db, dataset)
    df = _working_df(dataset, session)

    csv_bytes = df.to_csv(index=False).encode("utf-8")
    base_name = body.name or f"{dataset.name} (cleaned)"

    cleaned = Dataset(
        project_id=dataset.project_id,
        workspace_id=dataset.workspace_id,
        name=base_name,
        source_type="csv",
        original_filename=f"{base_name}.csv",
        content_type="text/csv",
        size_bytes=len(csv_bytes),
        status=DatasetStatus.PROFILING,
        storage_key="",
    )
    db.add(cleaned)
    db.flush()

    key = f"workspaces/{dataset.workspace_id}/datasets/{cleaned.id}/{base_name}.csv"
    get_storage().put(key, csv_bytes, "text/csv")
    cleaned.storage_key = key

    try:
        report = profile_dataframe(df)
        cleaned.row_count = report["dataset_summary"]["rows"]
        cleaned.column_count = report["dataset_summary"]["columns"]
        cleaned.quality_score = report["quality"]["score"]
        cleaned.status = DatasetStatus.READY
        db.add(ProfileReport(dataset_id=cleaned.id, report=report))
    except Exception:  # noqa: BLE001
        cleaned.status = DatasetStatus.ERROR

    db.commit()
    db.refresh(cleaned)
    return DatasetOut.model_validate(cleaned)
