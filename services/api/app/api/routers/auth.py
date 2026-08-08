"""Authentication endpoints (email/password).

These support local sign-up/sign-in. The frontend (Auth.js) can either use these
directly (Credentials provider) or mint its own JWT with the shared secret for
Google logins. Either way the backend verifies the shared-secret JWT.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentAuth, get_current_auth
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Membership, User, Workspace
from app.models.base import Role
from app.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
    WorkspaceOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "workspace"


def _unique_slug(db: Session, base: str) -> str:
    slug, i = base, 1
    while db.scalar(select(Workspace).where(Workspace.slug == slug)) is not None:
        i += 1
        slug = f"{base}-{i}"
    return slug


def _issue_token(user: User, workspace: Workspace, role: Role) -> TokenResponse:
    token = create_access_token(
        subject=user.id, email=user.email, workspace_id=workspace.id, role=role.value
    )
    return TokenResponse(
        access_token=token,
        user=UserOut.model_validate(user),
        workspace=WorkspaceOut.model_validate(workspace),
        role=role,
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="An account with this email exists"
        )
    name = payload.name or email.split("@")[0]
    user = User(email=email, name=name, hashed_password=hash_password(payload.password))
    db.add(user)
    db.flush()

    ws_name = payload.workspace_name or f"{name}'s Workspace"
    workspace = Workspace(name=ws_name, slug=_unique_slug(db, _slugify(ws_name)))
    db.add(workspace)
    db.flush()
    db.add(Membership(user_id=user.id, workspace_id=workspace.id, role=Role.OWNER))
    db.commit()
    db.refresh(user)
    db.refresh(workspace)
    return _issue_token(user, workspace, Role.OWNER)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not user.hashed_password or not verify_password(
        payload.password, user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    membership = db.scalar(select(Membership).where(Membership.user_id == user.id))
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="No workspace for this user"
        )
    workspace = db.get(Workspace, membership.workspace_id)
    return _issue_token(user, workspace, membership.role)


@router.get("/me", response_model=TokenResponse)
def me(auth: CurrentAuth = Depends(get_current_auth)) -> TokenResponse:
    """Return the resolved identity for the presented token (used by the frontend)."""
    return _issue_token(auth.user, auth.workspace, auth.role)
