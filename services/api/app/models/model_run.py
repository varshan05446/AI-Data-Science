"""AutoML training-run model.

Each :class:`ModelRun` records one "Predict Best Model" execution against a
dataset: the chosen target, inferred task, the ranked leaderboard, and the
winning model's metrics + explanations. Results are stored as JSON so the UI
can re-render a run without re-training.
"""
from __future__ import annotations

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class ModelRun(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "model_runs"

    dataset_id: Mapped[str] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), index=True
    )
    workspace_id: Mapped[str] = mapped_column(index=True)

    target: Mapped[str] = mapped_column()
    task: Mapped[str] = mapped_column()  # classification | regression
    best_model_key: Mapped[str] = mapped_column(default="")
    best_model_label: Mapped[str] = mapped_column(default="")
    primary_metric: Mapped[str] = mapped_column(default="")
    primary_score: Mapped[float] = mapped_column(default=0.0)

    # Full engine result (leaderboard, feature importance, confusion matrix, ...).
    result: Mapped[dict] = mapped_column(JSON, default=dict)
