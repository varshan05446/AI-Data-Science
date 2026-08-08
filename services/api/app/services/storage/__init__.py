"""Swappable object storage.

The rest of the app depends only on the `StorageBackend` interface, so switching
from local disk to S3/MinIO (or any S3-compatible service) is an env change.
"""
from app.services.storage.base import StorageBackend
from app.services.storage.factory import get_storage

__all__ = ["StorageBackend", "get_storage"]
