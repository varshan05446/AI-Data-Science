"""Notebook executor factory: selects the executor from configuration.

Mirrors the AI provider factory. Unknown/misconfigured executors degrade to a
clear :class:`UnavailableExecutor` so the notebook UI always renders and reports
*why* execution is disabled rather than crashing.
"""
from __future__ import annotations

from functools import lru_cache

import pandas as pd

from app.core.config import settings
from app.services.notebook.base import ExecutionResult, NotebookExecutor


class UnavailableExecutor(NotebookExecutor):
    """Placeholder used when no runnable executor is configured."""

    name = "unavailable"
    available = False
    description = "No notebook executor is configured for this environment."

    def __init__(self, reason: str = "") -> None:
        if reason:
            self.description = reason

    def execute(self, code: str, df: pd.DataFrame) -> ExecutionResult:
        return ExecutionResult(
            ok=False,
            error="Notebook execution is not available in this environment.",
        )


def _build(name: str) -> NotebookExecutor | None:
    if name in ("", "safe"):
        from app.services.notebook.safe_executor import SafeExecutor

        return SafeExecutor()
    if name == "full":
        from app.services.notebook.full_executor import FullExecutor

        return FullExecutor()
    return None


@lru_cache
def get_executor() -> NotebookExecutor:
    name = settings.notebook_executor.lower().strip()
    try:
        built = _build(name)
    except Exception:  # noqa: BLE001 - never fail on notebook misconfig
        built = None
    return built or UnavailableExecutor(
        reason=f"Unknown notebook executor '{name}'."
    )
