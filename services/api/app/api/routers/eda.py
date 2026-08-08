"""Automatic EDA endpoint with AI explanations per chart."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.resources import get_owned_dataset
from app.core.database import get_db
from app.models import Dataset
from app.schemas import EdaOut
from app.services.ai import get_llm
from app.services.ai.agents import explain_chart
from app.services.data.eda import generate_eda
from app.services.dataset_io import read_dataset_dataframe

router = APIRouter(tags=["eda"])


@router.get("/datasets/{dataset_id}/eda", response_model=EdaOut)
def dataset_eda(
    dataset: Dataset = Depends(get_owned_dataset), db: Session = Depends(get_db)
) -> EdaOut:
    try:
        df = read_dataset_dataframe(dataset)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Dataset file not found in storage"
        )

    charts = generate_eda(df)
    provider = get_llm()
    for chart in charts:
        chart["ai_explanation"] = explain_chart(provider, chart)
    return EdaOut(dataset_id=dataset.id, charts=charts)
