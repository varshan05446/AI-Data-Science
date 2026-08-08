"""Test configuration.

Sets environment variables to an isolated temp SQLite DB + local storage BEFORE
importing the application, so tests never touch developer data.
"""
from __future__ import annotations

import os
import tempfile

import pytest

_TMP = tempfile.mkdtemp(prefix="datamind-test-")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{os.path.join(_TMP, 'test.db')}")
os.environ.setdefault("LOCAL_STORAGE_DIR", os.path.join(_TMP, "storage"))
os.environ.setdefault("STORAGE_BACKEND", "local")
os.environ.setdefault("AI_PROVIDER", "mock")
os.environ.setdefault("AUTH_SECRET", "test-secret-please-change")


@pytest.fixture(scope="session", autouse=True)
def _init_database():
    from app.core.database import init_db

    init_db()
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c
