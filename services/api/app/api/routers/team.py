"""Team management endpoints: invite members."""
from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentAuth, get_current_auth, require_role
from app.core.database import get_db
from app.models import Membership, User, Workspace
from app.models.base import Role
from app.schemas import TeamInviteRequest, TeamInviteResponse

router = APIRouter(prefix="/team", tags=["team"])


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "member"


@router.post("/invite", response_model=TeamInviteResponse, status_code=status.HTTP_201_CREATED)
def invite_member(
    body: TeamInviteRequest,
    auth: CurrentAuth = Depends(require_role(Role.OWNER, Role.DATA_SCIENTIST)),
    db: Session = Depends(get_db),
) -> TeamInviteResponse:
    """Invite a user by email to the workspace. If they don't exist yet, create them."""
    email = body.email.lower().strip()

    # Check if user already exists
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        # Create a new user (they can set password on first login)
        user = User(
            id=uuid.uuid4().hex,
            email=email,
            name=email.split("@")[0],
            is_active=True,
        )
        db.add(user)
        db.flush()

    # Check if already a member
    existing = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.workspace_id == auth.workspace_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{email} is already a member of this workspace",
        )

    # Add membership
    role_value = body.role if body.role else "analyst"
    membership = Membership(
        user_id=user.id,
        workspace_id=auth.workspace_id,
        role=Role(role_value),
    )
    db.add(membership)
    db.commit()

    return TeamInviteResponse(
        message=f"{email} has been invited as {role_value}",
        email=email,
        role=role_value,
    )


@router.delete(
    "/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def remove_member(
    user_id: str,
    auth: CurrentAuth = Depends(require_role(Role.OWNER)),
    db: Session = Depends(get_db),
) -> None:
    """Remove a member from the workspace (owner only)."""
    if user_id == auth.user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove yourself")

    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user_id,
            Membership.workspace_id == auth.workspace_id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if membership.role == Role.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot remove workspace owner")

    db.delete(membership)
    db.commit()
