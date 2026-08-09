"""SQL Editor endpoint: execute SQL queries against dataset DataFrames."""
from __future__ import annotations

import re
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


def _slug(name: str) -> str:
    """Turn a dataset name into a safe SQLite table name."""
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_").lower()
    return slug or "dataset"


def _load_dataset_df(dataset: Dataset) -> pd.DataFrame:
    """Load a dataset's raw file back into a DataFrame for SQL queries."""
    storage = get_storage()
    raw = storage.get(dataset.storage_key)
    source_type = dataset.source_type or "csv"
    return load_dataframe(raw, source_type)


@router.post("/sql/execute", response_model=SqlExecuteResponse)
def execute_sql_multi(
    body: SqlExecuteRequest,
    auth: CurrentAuth = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> SqlExecuteResponse:
    """Execute SQL against one or more datasets loaded as named tables."""
    if not body.dataset_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide at least one dataset_id")

    datasets = db.scalars(
        select(Dataset).where(
            Dataset.id.in_(body.dataset_ids),
            Dataset.workspace_id == auth.workspace_id,
        )
    ).all()

    found_ids = {d.id for d in datasets}
    missing = set(body.dataset_ids) - found_ids
    if missing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Datasets not found: {missing}")

    t0 = time.time()
    try:
        mem_db = sqlite3.connect(":memory:")
        # Deduplicate table names
        used: dict[str, int] = {}
        for dataset in datasets:
            base = _slug(dataset.name)
            count = used.get(base, 0)
            table_name = base if count == 0 else f"{base}_{count}"
            used[base] = count + 1
            df = _load_dataset_df(dataset)
            df.to_sql(table_name, mem_db, index=False, if_exists="replace")

        result_df = pd.read_sql_query(body.query.strip(), mem_db)
        mem_db.close()

        elapsed_ms = int((time.time() - t0) * 1000)
        rows = result_df.head(body.limit).to_dict(orient="records")
        row_count = len(result_df)
        return SqlExecuteResponse(
            columns=list(result_df.columns),
            rows=rows,
            row_count=row_count,
            truncated=row_count > body.limit,
            execution_ms=elapsed_ms,
            error=None,
        )
    except Exception as exc:
        elapsed_ms = int((time.time() - t0) * 1000)
        return SqlExecuteResponse(
            columns=[], rows=[], row_count=0, truncated=False,
            execution_ms=elapsed_ms, error=str(exc),
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
