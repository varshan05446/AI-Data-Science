"""Dataset endpoints: upload, list, profile-on-ingest, fetch, delete.

Upload flow: store raw bytes in the storage backend, parse into a DataFrame,
run the profiling engine synchronously, persist the profile and quality score.
For very large datasets this would move to a background worker; the interface
is unchanged.
"""
from __future__ import annotations

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentAuth, get_current_auth, require_role
from app.api.resources import get_owned_dataset, get_owned_project
from app.core.database import get_db
from app.models import Dataset, ProfileReport, Project
from app.models.base import DatasetStatus, Role
from app.schemas import DatasetOut, ProfileOut
from app.services.data.ingest import IngestionError, detect_source_type, load_dataframe
from app.services.data.profiling import profile_dataframe
from app.services.storage import get_storage

router = APIRouter(tags=["datasets"])

_MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB safety cap


@router.get("/projects/{project_id}/datasets", response_model=list[DatasetOut])
def list_datasets(
    project: Project = Depends(get_owned_project), db: Session = Depends(get_db)
) -> list[DatasetOut]:
    rows = db.scalars(
        select(Dataset)
        .where(Dataset.project_id == project.id)
        .order_by(Dataset.created_at.desc())
    ).all()
    return [DatasetOut.model_validate(d) for d in rows]


@router.post(
    "/projects/{project_id}/datasets",
    response_model=DatasetOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_dataset(
    project_id: str,
    file: UploadFile = File(...),
    name: str = Form(default=""),
    auth: CurrentAuth = Depends(
        require_role(Role.OWNER, Role.DATA_SCIENTIST, Role.ANALYST)
    ),
    db: Session = Depends(get_db),
) -> DatasetOut:
    project = db.scalar(
        select(Project).where(
            Project.id == project_id, Project.workspace_id == auth.workspace_id
        )
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    raw = await file.read()
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds the 100 MB upload limit",
        )

    source_type = detect_source_type(file.filename or "", file.content_type or "")

    # Parse first so we fail fast on unparseable files before storing them.
    try:
        df = load_dataframe(raw, source_type)
    except IngestionError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    dataset = Dataset(
        project_id=project.id,
        workspace_id=auth.workspace_id,
        name=name or (file.filename or "dataset"),
        source_type=source_type,
        original_filename=file.filename or "",
        content_type=file.content_type or "",
        size_bytes=len(raw),
        status=DatasetStatus.PROFILING,
        storage_key="",  # set after we know the id
    )
    db.add(dataset)
    db.flush()

    key = f"workspaces/{auth.workspace_id}/datasets/{dataset.id}/{file.filename or 'data'}"
    get_storage().put(key, raw, dataset.content_type or "application/octet-stream")
    dataset.storage_key = key

    # Profile synchronously.
    try:
        report = profile_dataframe(df)
        dataset.row_count = report["dataset_summary"]["rows"]
        dataset.column_count = report["dataset_summary"]["columns"]
        dataset.quality_score = report["quality"]["score"]
        dataset.status = DatasetStatus.READY
        db.add(ProfileReport(dataset_id=dataset.id, report=report))
    except Exception:  # noqa: BLE001 - keep the raw file, mark for retry
        dataset.status = DatasetStatus.ERROR

    db.commit()
    db.refresh(dataset)
    return DatasetOut.model_validate(dataset)


@router.get("/datasets/{dataset_id}", response_model=DatasetOut)
def get_dataset(dataset: Dataset = Depends(get_owned_dataset)) -> DatasetOut:
    return DatasetOut.model_validate(dataset)


@router.get("/datasets/{dataset_id}/profile", response_model=ProfileOut)
def get_profile(
    dataset: Dataset = Depends(get_owned_dataset), db: Session = Depends(get_db)
) -> ProfileOut:
    profile = db.scalar(
        select(ProfileReport).where(ProfileReport.dataset_id == dataset.id)
    )
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Profile not available yet"
        )
    return ProfileOut(dataset_id=dataset.id, report=profile.report)


@router.delete("/datasets/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(
    dataset: Dataset = Depends(get_owned_dataset),
    auth: CurrentAuth = Depends(require_role(Role.OWNER, Role.DATA_SCIENTIST)),
    db: Session = Depends(get_db),
) -> Response:
    try:
        get_storage().delete(dataset.storage_key)
    except Exception:  # noqa: BLE001 - storage cleanup is best-effort
        pass
    db.delete(dataset)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
