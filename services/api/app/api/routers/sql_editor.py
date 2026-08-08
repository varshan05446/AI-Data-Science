"""SQL Editor endpoint: execute SQL queries against dataset DataFrames."""
from __future__ import annotations

import sqlite3
import time

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentAuth, get_current_auth
from app.core.database import get_db
from app.models import Dataset
from app.schemas import SqlExecuteRequest, SqlExecuteResponse
from app.services.data.ingest import load_dataframe
from app.services.storage import get_storage

router = APIRouter(tags=["sql-editor"])


def _load_dataset_df(dataset: Dataset) -> pd.DataFrame:
    """Load a dataset's raw file back into a DataFrame for SQL queries."""
    storage = get_storage()
    raw = storage.get(dataset.storage_key)
    source_type = dataset.source_type or "csv"
    return load_dataframe(raw, source_type)


@router.post("/datasets/{dataset_id}/sql/execute", response_model=SqlExecuteResponse)
def execute_sql(
    dataset_id: str,
    body: SqlExecuteRequest,
    auth: CurrentAuth = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> SqlExecuteResponse:
    """Execute a SQL query against a dataset using an in-memory SQLite engine."""
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.id == dataset_id, Dataset.workspace_id == auth.workspace_id
        )
    )
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    if not body.query or not body.query.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Query cannot be empty")

    t0 = time.time()
    try:
        df = _load_dataset_df(dataset)
        # Load into an in-memory SQLite database for SQL execution
        mem_db = sqlite3.connect(":memory:")
        df.to_sql("dataset", mem_db, index=False, if_exists="replace")

        query = body.query.strip()
        result_df = pd.read_sql_query(query, mem_db)
        mem_db.close()

        elapsed_ms = int((time.time() - t0) * 1000)
        columns = list(result_df.columns)
        rows = result_df.head(body.limit or 1000).to_dict(orient="records")
        row_count = len(result_df)

        return SqlExecuteResponse(
            columns=columns,
            rows=rows,
            row_count=row_count,
            truncated=row_count > (body.limit or 1000),
            execution_ms=elapsed_ms,
            error=None,
        )
    except Exception as exc:
        elapsed_ms = int((time.time() - t0) * 1000)
        return SqlExecuteResponse(
            columns=[],
            rows=[],
            row_count=0,
            truncated=False,
            execution_ms=elapsed_ms,
            error=str(exc),
        )


@router.get("/sql/datasets", response_model=list[dict])
def list_sql_datasets(
    auth: CurrentAuth = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[dict]:
    """List datasets available for SQL queries."""
    rows = db.scalars(
        select(Dataset).where(
            Dataset.workspace_id == auth.workspace_id,
            Dataset.status == "ready",
        ).order_by(Dataset.created_at.desc())
    ).all()
    return [{"id": d.id, "name": d.name, "rows": d.row_count, "columns": d.column_count} for d in rows]
