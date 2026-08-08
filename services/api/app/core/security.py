"""Security helpers: password hashing and JWT encode/decode.

The frontend (Auth.js) mints an HS256 JWT signed with the shared AUTH_SECRET and
sends it as a Bearer token. The backend verifies it with the same secret. The
helpers here also allow the backend to mint tokens for its own auth endpoints,
the seed script and tests.
"""
from __future__ import annotations

import datetime as dt
from typing import Any

import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except ValueError:
        return False


def create_access_token(
    subject: str,
    *,
    email: str,
    workspace_id: str | None = None,
    role: str | None = None,
    expires_minutes: int = 60 * 24 * 7,
    extra: dict[str, Any] | None = None,
) -> str:
    """Create an HS256 JWT compatible with the shared-secret verification."""
    now = dt.datetime.now(tz=dt.timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "email": email,
        "iat": now,
        "exp": now + dt.timedelta(minutes=expires_minutes),
    }
    if workspace_id:
        payload["workspace_id"] = workspace_id
    if role:
        payload["role"] = role
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.auth_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    """Decode and verify a JWT. Raises jwt.PyJWTError on failure."""
    return jwt.decode(
        token,
        settings.auth_secret,
        algorithms=[settings.jwt_algorithm],
        options={"require": ["exp", "sub"]},
    )
