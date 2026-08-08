"""Storage backend interface."""
from __future__ import annotations

import abc


class StorageBackend(abc.ABC):
    """Abstract object storage.

    Implementations must be safe to use per-request. Keys are opaque strings
    (e.g. ``workspaces/<ws>/datasets/<id>/data.csv``).
    """

    @abc.abstractmethod
    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Store bytes under ``key``. Returns the stored key."""

    @abc.abstractmethod
    def get(self, key: str) -> bytes:
        """Return the bytes stored under ``key``. Raises FileNotFoundError if missing."""

    @abc.abstractmethod
    def delete(self, key: str) -> None:
        """Delete the object at ``key`` (no error if absent)."""

    @abc.abstractmethod
    def exists(self, key: str) -> bool:
        """Return True if an object exists at ``key``."""
