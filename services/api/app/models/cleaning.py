"""Cleaning session model.

A single :class:`CleaningSession` per dataset stores the reproducible cleaning
*pipeline* (an ordered list of operation specs), a redo stack, and named
version snapshots. The working DataFrame is always derived by replaying the
pipeline over the dataset's original file, so undo/redo/version-history are
cheap, deterministic and never mutate the source data.
"""
from __future__ import annotations

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class CleaningSession(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "cleaning_sessions"

    dataset_id: Mapped[str] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), unique=True, index=True
    )
    workspace_id: Mapped[str] = mapped_column(index=True)

    # Ordered list of applied operation specs. Each entry is an OpSpec augmented
    # with a client-friendly ``id`` and ``label`` (see transforms.describe_step).
    steps: Mapped[list] = mapped_column(JSON, default=list)
    # Operations that were undone and can be redone (LIFO).
    redo_stack: Mapped[list] = mapped_column(JSON, default=list)
    # Named snapshots: [{"id", "label", "steps", "created_at"}].
    versions: Mapped[list] = mapped_column(JSON, default=list)
