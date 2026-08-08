"""API key generation and hashing utilities."""
from __future__ import annotations

import hashlib
import secrets


def generate_api_key() -> tuple[str, str, str]:
    """Generate a new API key.
    
    Returns:
        tuple of (full_key, prefix, key_hash)
    """
    prefix = "dm_live_"
    random_part = secrets.token_hex(24)
    full_key = f"{prefix}{random_part}"
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    return full_key, prefix, key_hash


def hash_api_key(key: str) -> str:
    """Hash an API key for verification."""
    return hashlib.sha256(key.encode()).hexdigest()
