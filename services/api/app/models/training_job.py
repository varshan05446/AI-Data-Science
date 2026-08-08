"""Background AutoML training-job model.

Each :class:`TrainingJob` tracks one asynchronous "Predict Best Model" request
end-to-end: queued -> running -> succeeded/failed. Progress, the current
pipeline stage and a rolling log are persisted so the UI can navigate away,
come back, and reconnect to the live job (or read the finished result via
``model_run_id``) without ever re-training.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class TrainingJob(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "training_jobs"

    dataset_id: Mapped[str] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), index=True
    )
    workspace_id: Mapped[str] = mapped_column(index=True)

    # queued | running | succeeded | failed
    status: Mapped[str] = mapped_column(default="queued", index=True)
    progress: Mapped[float] = mapped_column(default=0.0)  # 0-100
    stage: Mapped[str] = mapped_column(default="queued")
    logs: Mapped[list] = mapped_column(JSON, default=list)

    # The training request body + a stable hash so an identical config on the
    # same dataset can reconnect to a finished job instead of re-training.
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    config_hash: Mapped[str] = mapped_column(default="", index=True)

    error: Mapped[str] = mapped_column(default="")
    model_run_id: Mapped[Optional[str]] = mapped_column(default=None)
