"""Storage factory: selects the backend from configuration."""
from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.services.storage.base import StorageBackend


@lru_cache
def get_storage() -> StorageBackend:
    backend = settings.storage_backend.lower()
    if backend == "s3":
        from app.services.storage.s3 import S3Storage

        return S3Storage(
            endpoint_url=settings.s3_endpoint_url,
            access_key=settings.s3_access_key,
            secret_key=settings.s3_secret_key,
            bucket=settings.s3_bucket,
            region=settings.s3_region,
        )

    from app.services.storage.local import LocalFileStorage

    return LocalFileStorage(settings.local_storage_dir)
