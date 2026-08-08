"""Local filesystem storage backend (default, zero-config)."""
from __future__ import annotations

import os

from app.services.storage.base import StorageBackend


class LocalFileStorage(StorageBackend):
    def __init__(self, root_dir: str) -> None:
        self.root = os.path.abspath(root_dir)
        os.makedirs(self.root, exist_ok=True)

    def _path(self, key: str) -> str:
        # Normalise and prevent path traversal outside the storage root.
        safe = os.path.normpath(key).lstrip("/\\")
        full = os.path.abspath(os.path.join(self.root, safe))
        if not full.startswith(self.root):
            raise ValueError(f"Invalid storage key: {key!r}")
        return full

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        path = self._path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        return key

    def get(self, key: str) -> bytes:
        path = self._path(key)
        with open(path, "rb") as f:
            return f.read()

    def delete(self, key: str) -> None:
        path = self._path(key)
        if os.path.exists(path):
            os.remove(path)

    def exists(self, key: str) -> bool:
        return os.path.exists(self._path(key))
