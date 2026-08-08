"""Aggregate all v1 routers under a single APIRouter."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.routers import (
    ai_chat,
    api_keys,
    audit,
    auth,
    cleaning,
    copilot,
    datasets,
    eda,
    exports,
    exploration,
    insights,
    ml,
    notebook,
    projects,
    reports,
    sql_editor,
    team,
    workspaces,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(workspaces.router)
api_router.include_router(projects.router)
api_router.include_router(datasets.router)
api_router.include_router(cleaning.router)
api_router.include_router(eda.router)
api_router.include_router(exploration.router)
api_router.include_router(insights.router)
api_router.include_router(ml.router)
api_router.include_router(notebook.router)
api_router.include_router(ai_chat.router)
api_router.include_router(copilot.router)
api_router.include_router(reports.router)
api_router.include_router(exports.router)
api_router.include_router(audit.router)
api_router.include_router(api_keys.router)
api_router.include_router(sql_editor.router)
api_router.include_router(team.router)
