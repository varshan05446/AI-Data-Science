"""Dataset and profile report models."""
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Enum as SAEnum
from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import DatasetStatus, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.project import Project


class Dataset(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "datasets"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    workspace_id: Mapped[str] = mapped_column(index=True)

    name: Mapped[str] = mapped_column(String(255))
    source_type: Mapped[str] = mapped_column(String(40), default="csv")  # csv|excel|json|sql|...
    # Object key in the storage backend (local path or S3 key).
    storage_key: Mapped[str] = mapped_column(String(1024))
    original_filename: Mapped[str] = mapped_column(String(512), default="")
    content_type: Mapped[str] = mapped_column(String(120), default="")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)

    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    column_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    status: Mapped[DatasetStatus] = mapped_column(
        SAEnum(DatasetStatus), default=DatasetStatus.UPLOADED
    )

    project: Mapped["Project"] = relationship(back_populates="datasets")
    profile: Mapped["ProfileReport | None"] = relationship(
        back_populates="dataset",
        cascade="all, delete-orphan",
        uselist=False,
    )


class ProfileReport(UUIDMixin, TimestampMixin, Base):
    """Full data-profile payload stored as JSON (see services/data/profiling.py)."""

    __tablename__ = "profile_reports"

    dataset_id: Mapped[str] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), unique=True, index=True
    )
    report: Mapped[dict] = mapped_column(JSON, default=dict)

    dataset: Mapped["Dataset"] = relationship(back_populates="profile")
