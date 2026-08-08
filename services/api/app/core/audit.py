"""Audit logging middleware.

Records mutating requests (POST/PUT/PATCH/DELETE) to the audit_logs table for
enterprise traceability. Read requests are not logged to keep the table useful.
The user/workspace are resolved from the verified JWT when present.
"""
from __future__ import annotations

import contextlib

import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.database import SessionLocal
from app.core.security import decode_token

_AUDITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        if request.method not in _AUDITED_METHODS:
            return response

        # Skip auth endpoints noise but still record everything else.
        user_id = None
        workspace_id = None
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            with contextlib.suppress(jwt.PyJWTError, Exception):
                claims = decode_token(auth.split(" ", 1)[1])
                user_id = claims.get("sub")
                workspace_id = claims.get("workspace_id")

        with contextlib.suppress(Exception):
            self._write_log(
                request=request,
                status_code=response.status_code,
                user_id=user_id,
                workspace_id=workspace_id,
            )
        return response

    @staticmethod
    def _write_log(*, request: Request, status_code: int, user_id, workspace_id) -> None:
        from app.models import AuditLog

        # Derive a coarse action name from the path, e.g. /api/v1/datasets -> datasets
        parts = [p for p in request.url.path.split("/") if p]
        action = ".".join(parts[2:4]) if len(parts) >= 3 else request.url.path
        client_ip = request.client.host if request.client else ""

        db = SessionLocal()
        try:
            db.add(
                AuditLog(
                    workspace_id=workspace_id,
                    user_id=user_id,
                    action=f"{request.method.lower()}:{action}",
                    method=request.method,
                    path=request.url.path,
                    status_code=status_code,
                    ip_address=client_ip,
                )
            )
            db.commit()
        finally:
            db.close()
