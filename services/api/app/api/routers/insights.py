"""Business insights endpoint (agent pipeline over the stored profile)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.resources import get_owned_dataset
from app.core.database import get_db
from app.models import Dataset, ProfileReport
from app.schemas import CleaningOut, InsightsOut
from app.services.ai.agents import generate_insights, generate_narrative
from app.services.cleaning import suggest_cleaning_actions

router = APIRouter(tags=["insights"])


def _load_profile(db: Session, dataset: Dataset) -> dict:
    profile = db.scalar(select(ProfileReport).where(ProfileReport.dataset_id == dataset.id))
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Profile not available yet"
        )
    return profile.report


@router.get("/datasets/{dataset_id}/insights", response_model=InsightsOut)
def dataset_insights(
    dataset: Dataset = Depends(get_owned_dataset), db: Session = Depends(get_db)
) -> InsightsOut:
    report = _load_profile(db, dataset)
    return InsightsOut(
        dataset_id=dataset.id,
        insights=generate_insights(report),
        summary=generate_narrative(report),
    )


@router.get("/datasets/{dataset_id}/cleaning", response_model=CleaningOut)
def dataset_cleaning(
    dataset: Dataset = Depends(get_owned_dataset), db: Session = Depends(get_db)
) -> CleaningOut:
    report = _load_profile(db, dataset)
    return CleaningOut(dataset_id=dataset.id, suggestions=suggest_cleaning_actions(report))
