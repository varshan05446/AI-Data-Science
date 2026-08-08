"""Shared model mixins and enums."""
from __future__ import annotations

import datetime as dt
import enum
import uuid

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column


def new_uuid() -> str:
    return uuid.uuid4().hex


class UUIDMixin:
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_uuid)


class TimestampMixin:
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: dt.datetime.now(dt.timezone.utc)
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: dt.datetime.now(dt.timezone.utc),
        onupdate=lambda: dt.datetime.now(dt.timezone.utc),
    )


class Role(str, enum.Enum):
    """Workspace roles map to the product's user types."""

    OWNER = "owner"
    DATA_SCIENTIST = "data_scientist"
    ANALYST = "analyst"
    EXECUTIVE = "executive"
    BUSINESS = "business"


class ProjectStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class DatasetStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    PROFILING = "profiling"
    READY = "ready"
    ERROR = "error"
