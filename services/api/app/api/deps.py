"""Shared FastAPI dependencies: authentication, workspace isolation, RBAC.

The frontend (Auth.js) sends a Bearer JWT signed with the shared AUTH_SECRET.
We verify it, then resolve (and lazily provision) the user, their workspace and
role. Every downstream query is scoped to ``auth.workspace_id`` to guarantee
tenant isolation.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models import Membership, User, Workspace
from app.models.base import Role

_bearer = HTTPBearer(auto_error=True)


@dataclass
class CurrentAuth:
    user: User
    workspace: Workspace
    role: Role

    @property
    def user_id(self) -> str:
        return self.user.id

    @property
    def workspace_id(self) -> str:
        return self.workspace.id


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "workspace"


def _ensure_user_and_workspace(db: Session, claims: dict) -> CurrentAuth:
    user_id = claims.get("sub")
    email = (claims.get("email") or "").lower()
    name = claims.get("name") or (email.split("@")[0] if email else "User")

    user: User | None = None
    if user_id:
        user = db.get(User, user_id)
    if user is None and email:
        user = db.scalar(select(User).where(User.email == email))

    # Lazily provision users that authenticated via the frontend (e.g. Google).
    if user is None:
        if not email:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user = User(id=user_id or None, email=email, name=name)
        db.add(user)
        db.flush()

    # Resolve membership; create a personal workspace on first login.
    membership: Membership | None = None
    ws_claim = claims.get("workspace_id")
    if ws_claim:
        membership = db.scalar(
            select(Membership).where(
                Membership.user_id == user.id, Membership.workspace_id == ws_claim
            )
        )
    if membership is None:
        membership = db.scalar(select(Membership).where(Membership.user_id == user.id))
    if membership is None:
        base = _slugify(name)
        slug = base
        i = 1
        while db.scalar(select(Workspace).where(Workspace.slug == slug)) is not None:
            i += 1
            slug = f"{base}-{i}"
        workspace = Workspace(name=f"{name}'s Workspace", slug=slug)
        db.add(workspace)
        db.flush()
        membership = Membership(user_id=user.id, workspace_id=workspace.id, role=Role.OWNER)
        db.add(membership)
        db.flush()

    db.commit()
    workspace = db.get(Workspace, membership.workspace_id)
    return CurrentAuth(user=user, workspace=workspace, role=membership.role)


def get_current_auth(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> CurrentAuth:
    try:
        claims = decode_token(creds.credentials)
    except jwt.PyJWTError as exc:
        print(f"JWT Decode Error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
        ) from exc
    return _ensure_user_and_workspace(db, claims)


def require_role(*allowed: Role):
    """Dependency factory enforcing that the caller has one of ``allowed`` roles."""

    def _guard(auth: CurrentAuth = Depends(get_current_auth)) -> CurrentAuth:
        if auth.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return auth

    return _guard
