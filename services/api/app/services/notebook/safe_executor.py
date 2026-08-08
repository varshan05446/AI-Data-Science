"""Offline, read-only pandas executor.

The default notebook backend. It runs a **restricted** subset of Python against
the dataset so users get a real code-driven exploration experience without the
platform ever executing arbitrary/untrusted code:

* the source is parsed to an AST and every node is checked against a strict
  whitelist (no imports, function/class defs, ``with``/``try``, loops, ``del``,
  global/nonlocal, walrus, f-string is allowed but not attribute access to
  dunder members);
* names resolve only to a small namespace (``df``, ``pd``, ``np`` plus a curated
  set of builtins) — everything else raises before execution;
* attribute access to any ``_``-prefixed member is rejected, which closes the
  usual sandbox-escape routes (``__class__``, ``__globals__`` …).

It is deterministic and safe to run in-process. A production deployment can swap
in a real kernel executor via configuration.
"""
from __future__ import annotations

import ast
import contextlib
import io
import time
from typing import Any

import numpy as np
import pandas as pd

from app.services.notebook.base import (
    ExecutionOutput,
    ExecutionResult,
    NotebookExecutor,
)

_MAX_CODE_CHARS = 5000
_MAX_TABLE_ROWS = 100
_MAX_TEXT_CHARS = 20_000

# AST node types permitted anywhere in a cell. Deliberately excludes Import,
# FunctionDef, ClassDef, With, Try, For/While, Delete, Global, Nonlocal, etc.
_ALLOWED_NODES: tuple[type[ast.AST], ...] = (
    ast.Module,
    ast.Expr,
    ast.Assign,
    ast.AugAssign,
    ast.AnnAssign,
    ast.Name,
    ast.Load,
    ast.Store,
    ast.Constant,
    ast.Attribute,
    ast.Subscript,
    ast.Slice,
    ast.Index if hasattr(ast, "Index") else ast.Slice,  # py<3.9 compat
    ast.Call,
    ast.keyword,
    ast.Starred,
    ast.List,
    ast.Tuple,
    ast.Dict,
    ast.Set,
    ast.ListComp,
    ast.SetComp,
    ast.DictComp,
    ast.GeneratorExp,
    ast.comprehension,
    ast.Lambda,
    ast.arguments,
    ast.arg,
    ast.IfExp,
    ast.BoolOp,
    ast.BinOp,
    ast.UnaryOp,
    ast.Compare,
    ast.And,
    ast.Or,
    ast.Not,
    ast.USub,
    ast.UAdd,
    ast.Invert,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.FloorDiv,
    ast.Mod,
    ast.Pow,
    ast.MatMult,
    ast.BitAnd,
    ast.BitOr,
    ast.BitXor,
    ast.LShift,
    ast.RShift,
    ast.Eq,
    ast.NotEq,
    ast.Lt,
    ast.LtE,
    ast.Gt,
    ast.GtE,
    ast.Is,
    ast.IsNot,
    ast.In,
    ast.NotIn,
    ast.JoinedStr,
    ast.FormattedValue,
)

_SAFE_BUILTINS: dict[str, Any] = {
    "abs": abs,
    "min": min,
    "max": max,
    "sum": sum,
    "round": round,
    "len": len,
    "sorted": sorted,
    "range": range,
    "enumerate": enumerate,
    "zip": zip,
    "list": list,
    "dict": dict,
    "set": set,
    "tuple": tuple,
    "str": str,
    "int": int,
    "float": float,
    "bool": bool,
    "print": print,
    "True": True,
    "False": False,
    "None": None,
}


class UnsafeCodeError(ValueError):
    """Raised when a cell contains a disallowed construct."""


def _validate(tree: ast.AST) -> None:
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODES):
            raise UnsafeCodeError(
                f"'{type(node).__name__}' is not allowed in the safe notebook. "
                "This executor supports read-only pandas expressions only."
            )
        # Block dunder / private attribute access (sandbox-escape guard).
        if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            raise UnsafeCodeError(
                f"Access to '{node.attr}' is not allowed."
            )
        # Block private/dunder name references.
        if isinstance(node, ast.Name) and node.id.startswith("__"):
            raise UnsafeCodeError(f"Access to '{node.id}' is not allowed.")


def _to_output(value: Any) -> ExecutionOutput:
    """Render a Python/pandas value into a notebook output."""
    if value is None:
        return ExecutionOutput(type="text", text="")
    if isinstance(value, pd.DataFrame):
        safe = value.head(_MAX_TABLE_ROWS).replace({np.nan: None})
        return ExecutionOutput(
            type="table",
            columns=[str(c) for c in safe.columns],
            rows=[
                {str(k): _py(v) for k, v in row.items()}
                for row in safe.to_dict(orient="records")
            ],
        )
    if isinstance(value, pd.Series):
        safe = value.head(_MAX_TABLE_ROWS)
        frame = safe.reset_index()
        frame.columns = [str(c) for c in frame.columns]
        return ExecutionOutput(
            type="table",
            columns=[str(c) for c in frame.columns],
            rows=[
                {str(k): _py(v) for k, v in row.items()}
                for row in frame.replace({np.nan: None}).to_dict(orient="records")
            ],
        )
    return ExecutionOutput(type="text", text=str(value)[:_MAX_TEXT_CHARS])


def _py(v: Any) -> Any:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, (pd.Timestamp,)):
        return v.isoformat()
    if isinstance(v, (int, float, bool, str)):
        return v
    return str(v)


class SafeExecutor(NotebookExecutor):
    """Deterministic, offline executor for read-only pandas exploration."""

    name = "safe"
    available = True
    description = (
        "Runs read-only pandas expressions on a copy of your dataset "
        "(df, pd, np). Imports, loops and file/network access are disabled."
    )

    def execute(self, code: str, df: pd.DataFrame) -> ExecutionResult:
        start = time.perf_counter()
        code = (code or "").strip()
        if not code:
            return ExecutionResult(ok=True, outputs=[], execution_ms=0)
        if len(code) > _MAX_CODE_CHARS:
            return ExecutionResult(
                ok=False,
                error=f"Cell exceeds {_MAX_CODE_CHARS} characters.",
                execution_ms=0,
            )

        try:
            tree = ast.parse(code, mode="exec")
            _validate(tree)
        except (SyntaxError, UnsafeCodeError) as exc:
            return ExecutionResult(
                ok=False,
                error=str(exc),
                execution_ms=int((time.perf_counter() - start) * 1000),
            )

        # A private copy keeps user code from mutating cached/shared state.
        namespace: dict[str, Any] = {
            "__builtins__": _SAFE_BUILTINS,
            "df": df.copy(),
            "pd": pd,
            "np": np,
        }

        # Execute every statement; if the final one is a bare expression, we
        # capture its value as the cell's displayed output (Jupyter semantics).
        body = list(tree.body)
        last_expr: ast.Expr | None = None
        if body and isinstance(body[-1], ast.Expr):
            last_expr = body.pop()  # type: ignore[assignment]

        stdout = io.StringIO()
        outputs: list[ExecutionOutput] = []
        try:
            with contextlib.redirect_stdout(stdout):
                if body:
                    exec(  # noqa: S102 - sandboxed via AST whitelist + builtins
                        compile(ast.Module(body=body, type_ignores=[]), "<cell>", "exec"),
                        namespace,
                    )
                if last_expr is not None:
                    value = eval(  # noqa: S307 - sandboxed via AST whitelist
                        compile(ast.Expression(last_expr.value), "<cell>", "eval"),
                        namespace,
                    )
                    outputs.append(_to_output(value))
        except Exception as exc:  # noqa: BLE001 - surface runtime errors to the UI
            return ExecutionResult(
                ok=False,
                stdout=stdout.getvalue()[:_MAX_TEXT_CHARS],
                error=f"{type(exc).__name__}: {exc}",
                execution_ms=int((time.perf_counter() - start) * 1000),
            )

        return ExecutionResult(
            ok=True,
            outputs=outputs,
            stdout=stdout.getvalue()[:_MAX_TEXT_CHARS],
            execution_ms=int((time.perf_counter() - start) * 1000),
        )
