"""Project CRUD endpoints (workspace-scoped)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentAuth, get_current_auth, require_role
from app.api.resources import get_owned_project
from app.core.database import get_db
from app.models import Dataset, Project
from app.models.base import Role
from app.schemas import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


def _to_out(db: Session, project: Project) -> ProjectOut:
    count = db.scalar(
        select(func.count(Dataset.id)).where(Dataset.project_id == project.id)
    ) or 0
    out = ProjectOut.model_validate(project)
    out.dataset_count = int(count)
    return out


@router.get("", response_model=list[ProjectOut])
def list_projects(
    auth: CurrentAuth = Depends(get_current_auth), db: Session = Depends(get_db)
) -> list[ProjectOut]:
    projects = db.scalars(
        select(Project)
        .where(Project.workspace_id == auth.workspace_id)
        .order_by(Project.updated_at.desc())
    ).all()
    return [_to_out(db, p) for p in projects]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    auth: CurrentAuth = Depends(
        require_role(Role.OWNER, Role.DATA_SCIENTIST, Role.ANALYST)
    ),
    db: Session = Depends(get_db),
) -> ProjectOut:
    project = Project(
        workspace_id=auth.workspace_id,
        owner_id=auth.user_id,
        name=payload.name,
        description=payload.description,
        business_domain=payload.business_domain,
        goals=payload.goals,
        tags=payload.tags,
        status=payload.status,
        team_member_ids=[auth.user_id],
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _to_out(db, project)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project: Project = Depends(get_owned_project), db: Session = Depends(get_db)
) -> ProjectOut:
    return _to_out(db, project)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    payload: ProjectUpdate,
    project: Project = Depends(get_owned_project),
    db: Session = Depends(get_db),
) -> ProjectOut:
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return _to_out(db, project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project: Project = Depends(get_owned_project),
    auth: CurrentAuth = Depends(require_role(Role.OWNER, Role.DATA_SCIENTIST)),
    db: Session = Depends(get_db),
) -> Response:
    db.delete(project)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
