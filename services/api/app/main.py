"""FastAPI application factory for DataMind AI."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.audit import AuditMiddleware
from app.core.config import settings
from app.core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev convenience: ensure tables exist. Production uses Alembic migrations.
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="AI-powered Data Science Operating System API.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(AuditMiddleware)

    @app.get("/health", tags=["system"])
    def health() -> dict:
        return {
            "status": "ok",
            "environment": settings.environment,
            "ai_provider": settings.ai_provider,
            "storage_backend": settings.storage_backend,
        }

    app.include_router(api_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
