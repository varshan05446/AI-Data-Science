"""Workspace endpoints: current workspace + members."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentAuth, get_current_auth
from app.core.database import get_db
from app.models import Dataset, Membership, ModelRun, Project, User
from app.schemas import MemberOut, UserOut, WorkspaceOut, WorkspaceStatsOut

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("/current", response_model=WorkspaceOut)
def current_workspace(auth: CurrentAuth = Depends(get_current_auth)) -> WorkspaceOut:
    return WorkspaceOut.model_validate(auth.workspace)


@router.get("/current/members", response_model=list[MemberOut])
def list_members(
    auth: CurrentAuth = Depends(get_current_auth), db: Session = Depends(get_db)
) -> list[MemberOut]:
    rows = db.scalars(
        select(Membership).where(Membership.workspace_id == auth.workspace_id)
    ).all()
    members: list[MemberOut] = []
    for m in rows:
        user = db.get(User, m.user_id)
        if user:
            members.append(MemberOut(user=UserOut.model_validate(user), role=m.role))
    return members


@router.get("/current/stats", response_model=WorkspaceStatsOut)
def workspace_stats(
    auth: CurrentAuth = Depends(get_current_auth), db: Session = Depends(get_db)
) -> WorkspaceStatsOut:
    """Accurate workspace-wide counts, computed directly from the database."""
    projects = (
        db.scalar(
            select(func.count(Project.id)).where(
                Project.workspace_id == auth.workspace_id
            )
        )
        or 0
    )
    datasets = (
        db.scalar(
            select(func.count(Dataset.id)).where(
                Dataset.workspace_id == auth.workspace_id
            )
        )
        or 0
    )
    models = (
        db.scalar(
            select(func.count(ModelRun.id)).where(
                ModelRun.workspace_id == auth.workspace_id
            )
        )
        or 0
    )
    return WorkspaceStatsOut(
        projects=int(projects),
        datasets=int(datasets),
        models=int(models),
    )
