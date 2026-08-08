"""Workspace-scoped resource resolvers.

Centralises tenant-isolation checks: every lookup requires the resource to
belong to the caller's workspace, otherwise a 404 is returned (we avoid 403 to
prevent leaking existence across tenants).
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentAuth, get_current_auth
from app.core.database import get_db
from app.models import Dataset, Project


def get_owned_project(
    project_id: str,
    auth: CurrentAuth = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> Project:
    project = db.scalar(
        select(Project).where(
            Project.id == project_id, Project.workspace_id == auth.workspace_id
        )
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def get_owned_dataset(
    dataset_id: str,
    auth: CurrentAuth = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> Dataset:
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.id == dataset_id, Dataset.workspace_id == auth.workspace_id
        )
    )
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return dataset
