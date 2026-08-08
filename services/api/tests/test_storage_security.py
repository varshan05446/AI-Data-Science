"""Tests for storage abstraction and JWT verification."""
from __future__ import annotations

import os
import tempfile

import jwt
import pytest

from app.core.security import create_access_token, decode_token
from app.services.storage.local import LocalFileStorage


def test_local_storage_roundtrip():
    with tempfile.TemporaryDirectory() as tmp:
        store = LocalFileStorage(tmp)
        key = "a/b/data.csv"
        assert store.exists(key) is False
        store.put(key, b"hello,world")
        assert store.exists(key) is True
        assert store.get(key) == b"hello,world"
        store.delete(key)
        assert store.exists(key) is False


def test_local_storage_rejects_traversal():
    with tempfile.TemporaryDirectory() as tmp:
        store = LocalFileStorage(tmp)
        with pytest.raises(ValueError):
            store.put("../escape.txt", b"x")


def test_jwt_roundtrip():
    token = create_access_token(
        subject="user-1", email="a@b.com", workspace_id="ws-1", role="owner"
    )
    claims = decode_token(token)
    assert claims["sub"] == "user-1"
    assert claims["email"] == "a@b.com"
    assert claims["workspace_id"] == "ws-1"
    assert claims["role"] == "owner"


def test_jwt_rejects_tampered_token():
    token = create_access_token(subject="u", email="a@b.com")
    with pytest.raises(jwt.PyJWTError):
        decode_token(token + "tampered")
