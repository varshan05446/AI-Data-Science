"""Notebook execution layer interfaces and shared data shapes.

The notebook UI talks to a *pluggable* executor: the frontend never assumes how
code runs. The default :class:`~app.services.notebook.safe_executor.SafeExecutor`
evaluates a restricted, read-only pandas subset entirely offline, but a real
Jupyter-kernel executor can be registered via configuration without touching the
API surface (see :mod:`app.services.notebook.factory`).
"""
from __future__ import annotations

import abc
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

import pandas as pd

OutputType = Literal["text", "table", "error", "html", "image"]


@dataclass
class ExecutionOutput:
    """A single rendered output produced by running a cell."""

    type: OutputType
    # For "text"/"html"/"error": ``text`` holds the content.
    text: str = ""
    # For "table": ``columns`` + ``rows`` mirror the frontend table shape.
    columns: list[str] = field(default_factory=list)
    rows: list[dict[str, Any]] = field(default_factory=list)
    # For "image": base64-encoded PNG (no data-URI prefix).
    image: str = ""

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class VariableInfo:
    """A user-defined variable captured after running a cell."""

    name: str
    type: str
    preview: str
    shape: str = ""

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ExecutionResult:
    """Outcome of executing one cell's code."""

    ok: bool
    outputs: list[ExecutionOutput] = field(default_factory=list)
    stdout: str = ""
    execution_ms: int = 0
    error: str | None = None
    #: Snapshot of user-defined variables (for the variable explorer panel).
    variables: list[VariableInfo] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "outputs": [o.as_dict() for o in self.outputs],
            "stdout": self.stdout,
            "execution_ms": self.execution_ms,
            "error": self.error,
            "variables": [v.as_dict() for v in self.variables],
        }


class NotebookExecutor(abc.ABC):
    """Interface implemented by every notebook backend."""

    name: str = "base"
    #: Whether this executor can actually run code in the current environment.
    available: bool = True
    #: Short, user-facing description of what the executor supports/restricts.
    description: str = ""

    @abc.abstractmethod
    def execute(self, code: str, df: pd.DataFrame) -> ExecutionResult:
        """Run ``code`` with the dataset available as ``df`` and return outputs."""

    def starter_cells(self) -> list[str]:
        """Suggested starter cells for a fresh notebook against ``df``."""
        return [
            "df.head()",
            "df.describe(include='all')",
            "df.isna().mean().sort_values(ascending=False)",
        ]

    def describe(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "available": self.available,
            "description": self.description,
        }
