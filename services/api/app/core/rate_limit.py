"""In-memory sliding-window rate limiter.

Usage::

    from app.core.rate_limit import rate_limiter

    @router.post("/verify")
    def verify(..., request: Request):
        rate_limiter.check(request.client.host, max_requests=30, window_seconds=60)
        ...
"""

from __future__ import annotations

import time
import threading
from collections import defaultdict


class RateLimitExceeded(Exception):
    """Raised when a rate limit is exceeded."""

    def __init__(self, retry_after: int) -> None:
        self.retry_after = retry_after
        super().__init__(f"Rate limit exceeded. Retry after {retry_after}s.")


class _SlidingWindowLimiter:
    """Thread-safe, per-key sliding-window rate limiter."""

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def check(
        self,
        key: str,
        *,
        max_requests: int = 60,
        window_seconds: int = 60,
    ) -> int:
        """Check rate limit. Raises ``RateLimitExceeded`` if exceeded.

        Returns the remaining number of allowed requests.
        """
        now = time.monotonic()
        cutoff = now - window_seconds

        with self._lock:
            self._hits[key] = [t for t in self._hits[key] if t > cutoff]

            if len(self._hits[key]) >= max_requests:
                oldest = self._hits[key][0]
                retry_after = int(oldest + window_seconds - now) + 1
                raise RateLimitExceeded(max(1, retry_after))

            self._hits[key].append(now)
            return max_requests - len(self._hits[key])

    def reset(self, key: str) -> None:
        """Reset the counter for a specific key (useful in tests)."""
        with self._lock:
            self._hits.pop(key, None)


# Module-level singleton.
rate_limiter = _SlidingWindowLimiter()
