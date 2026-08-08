"""Notebook execution endpoints.

Exposes the pluggable notebook executor to the UI: ``info`` reports the active
executor's capabilities and starter cells; ``execute`` runs a single cell's code
against the dataset (loaded as ``df``) and returns rendered outputs. Cells are
stateless on the server — the frontend owns the notebook document.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.resources import get_owned_dataset
from app.core.database import get_db
from app.models import Dataset, ProfileReport
from app.services.dataset_io import read_dataset_dataframe
from app.services.notebook.factory import get_executor

router = APIRouter(tags=["notebook"])

_MAX_CODE_CHARS = 5000


class NotebookInfoOut(BaseModel):
    dataset_id: str
    executor: dict
    starter_cells: list[str]
    columns: list[str]


class NotebookExecuteRequest(BaseModel):
    code: str = Field(min_length=0, max_length=_MAX_CODE_CHARS)


class NotebookExecuteOut(BaseModel):
    ok: bool
    outputs: list[dict]
    stdout: str
    execution_ms: int
    error: str | None = None
    variables: list[dict] = Field(default_factory=list)


class NotebookAssistRequest(BaseModel):
    prompt: str = Field(min_length=0, max_length=1000)
    error: str | None = Field(default=None, max_length=2000)


class NotebookAssistOut(BaseModel):
    code: str


def _load_df(dataset: Dataset):
    try:
        return read_dataset_dataframe(dataset)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset file not found in storage",
        )


@router.get("/datasets/{dataset_id}/notebook/info", response_model=NotebookInfoOut)
def notebook_info(
    dataset: Dataset = Depends(get_owned_dataset),
) -> NotebookInfoOut:
    executor = get_executor()
    df = _load_df(dataset)
    return NotebookInfoOut(
        dataset_id=dataset.id,
        executor=executor.describe(),
        starter_cells=executor.starter_cells(),
        columns=[str(c) for c in df.columns],
    )


@router.post(
    "/datasets/{dataset_id}/notebook/execute", response_model=NotebookExecuteOut
)
def notebook_execute(
    body: NotebookExecuteRequest,
    dataset: Dataset = Depends(get_owned_dataset),
    db: Session = Depends(get_db),
) -> NotebookExecuteOut:
    executor = get_executor()
    df = _load_df(dataset)
    result = executor.execute(body.code, df)
    return NotebookExecuteOut(**result.as_dict())


@router.post(
    "/datasets/{dataset_id}/notebook/assist", response_model=NotebookAssistOut
)
def notebook_assist(
    body: NotebookAssistRequest,
    dataset: Dataset = Depends(get_owned_dataset),
    db: Session = Depends(get_db),
) -> NotebookAssistOut:
    """Generate (or fix) a cell's Python from a natural-language prompt.

    Stateless and offline: it reuses the deterministic analyst code generator
    grounded in the dataset's stored profile. It never persists to chat history.
    """
    from app.services.ai.analyst import assist_code

    df = _load_df(dataset)
    profile_row = db.scalar(
        select(ProfileReport).where(ProfileReport.dataset_id == dataset.id)
    )
    profile = profile_row.report if profile_row else {}
    code = assist_code(df, body.prompt, profile, body.error)
    return NotebookAssistOut(code=code)
