"""API Keys endpoints: create, list, revoke, and verify keys."""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentAuth, get_current_auth, require_role
from app.core.database import get_db
from app.core.rate_limit import RateLimitExceeded, rate_limiter
from app.models import ApiKey, Membership, User, Workspace
from app.models.base import Role
from app.schemas import ApiKeyCreate, ApiKeyOut, ApiKeyCreateResponse, ApiKeyVerifyRequest, ApiKeyVerifyResponse
from app.services.security import generate_api_key, hash_api_key

router = APIRouter(prefix="/api-keys", tags=["api-keys"])

# Rate limit constants for the verify endpoint
VERIFY_MAX_REQUESTS = 30
VERIFY_WINDOW_SECONDS = 60


@router.post("", response_model=ApiKeyCreateResponse, status_code=status.HTTP_201_CREATED)
def create_api_key(
    body: ApiKeyCreate,
    auth: CurrentAuth = Depends(require_role(Role.OWNER, Role.DATA_SCIENTIST)),
    db: Session = Depends(get_db),
) -> ApiKeyCreateResponse:
    full_key, prefix, key_hash = generate_api_key()
    api_key = ApiKey(
        workspace_id=auth.workspace_id,
        user_id=auth.user_id,
        name=body.name,
        prefix=prefix,
        key_hash=key_hash,
        is_active=True,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)
    return ApiKeyCreateResponse(
        id=api_key.id,
        name=api_key.name,
        prefix=prefix,
        key=full_key,
        created_at=api_key.created_at.isoformat(),
    )


@router.get("", response_model=list[ApiKeyOut])
def list_api_keys(
    auth: CurrentAuth = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[ApiKeyOut]:
    rows = db.scalars(
        select(ApiKey)
        .where(ApiKey.workspace_id == auth.workspace_id, ApiKey.is_active == True)
        .order_by(ApiKey.created_at.desc())
    ).all()
    return [ApiKeyOut.model_validate(k) for k in rows]


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_api_key(
    key_id: str,
    auth: CurrentAuth = Depends(require_role(Role.OWNER, Role.DATA_SCIENTIST)),
    db: Session = Depends(get_db),
) -> Response:
    api_key = db.scalar(
        select(ApiKey).where(
            ApiKey.id == key_id,
            ApiKey.workspace_id == auth.workspace_id,
        )
    )
    if api_key is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    api_key.is_active = False
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/verify", response_model=ApiKeyVerifyResponse)
def verify_api_key(
    body: ApiKeyVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> ApiKeyVerifyResponse:
    """Verify an API key and return associated workspace/user info.

    This endpoint is used by external services to validate API keys.
    No authentication is required - the key itself is the credential.

    Rate limited to 30 requests per minute per IP to prevent abuse.
    """
    # Rate limit by client IP to prevent brute-force attacks
    client_ip = request.client.host if request.client else "unknown"
    try:
        rate_limiter.check(
            f"verify:{client_ip}",
            max_requests=VERIFY_MAX_REQUESTS,
            window_seconds=VERIFY_WINDOW_SECONDS,
        )
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please try again later.",
            headers={"Retry-After": str(exc.retry_after)},
        )

    if not body.key or not body.key.startswith("dm_live_"):
        return ApiKeyVerifyResponse(
            valid=False,
            error="Invalid key format",
        )

    key_hash = hash_api_key(body.key)
    api_key = db.scalar(
        select(ApiKey).where(
            ApiKey.key_hash == key_hash,
            ApiKey.is_active == True,
        )
    )

    if api_key is None:
        return ApiKeyVerifyResponse(
            valid=False,
            error="Key not found or revoked",
        )

    # Update last_used_at timestamp
    api_key.last_used_at = dt.datetime.now(dt.timezone.utc).isoformat()
    db.commit()

    # Fetch associated workspace and user
    workspace = db.get(Workspace, api_key.workspace_id)
    user = db.get(User, api_key.user_id)

    # Get role from membership
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == api_key.user_id,
            Membership.workspace_id == api_key.workspace_id,
        )
    )

    return ApiKeyVerifyResponse(
        valid=True,
        key_id=api_key.id,
        name=api_key.name,
        workspace_id=api_key.workspace_id,
        workspace_name=workspace.name if workspace else None,
        user_id=api_key.user_id,
        user_email=user.email if user else None,
        role=membership.role.value if membership else None,
        last_used_at=api_key.last_used_at,
    )
