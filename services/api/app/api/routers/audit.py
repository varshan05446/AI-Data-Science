"""Audit log endpoint (workspace-scoped, read-only)."""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentAuth, require_role
from app.core.database import get_db
from app.models import AuditLog
from app.models.base import Role

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    action: str
    method: str
    path: str
    status_code: int
    user_id: str | None = None
    created_at: dt.datetime


@router.get("/logs", response_model=list[AuditLogOut])
def list_audit_logs(
    limit: int = 100,
    auth: CurrentAuth = Depends(require_role(Role.OWNER, Role.DATA_SCIENTIST)),
    db: Session = Depends(get_db),
) -> list[AuditLogOut]:
    rows = db.scalars(
        select(AuditLog)
        .where(AuditLog.workspace_id == auth.workspace_id)
        .order_by(AuditLog.created_at.desc())
        .limit(min(limit, 500))
    ).all()
    return [AuditLogOut.model_validate(r) for r in rows]
