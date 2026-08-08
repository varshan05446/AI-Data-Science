"""Real in-process Python notebook executor.

Runs genuine Python against the application's virtual environment with the data
analysis stack preloaded (``df, pd, np, plt, sns, px, sklearn``). It captures:

* everything written to ``stdout`` (``print`` output);
* the value of the final bare expression (Jupyter display semantics);
* every matplotlib figure created during the cell, rendered to a base64 PNG so
  the frontend can show real charts;
* a snapshot of user-defined variables for the *variable explorer* panel.

This is intended for the single-user, local desktop context — it executes
arbitrary code, so it is gated behind ``settings.notebook_executor == "full"``
and the :class:`~app.services.notebook.safe_executor.SafeExecutor` remains the
conservative default fallback.
"""
from __future__ import annotations

import base64
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
    VariableInfo,
)

_MAX_CODE_CHARS = 20_000
_MAX_TABLE_ROWS = 100
_MAX_TEXT_CHARS = 20_000
_MAX_FIGURES = 8
_MAX_VARIABLES = 40


def _py(v: Any) -> Any:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return float(v)
    if isinstance(v, np.bool_):
        return bool(v)
    if isinstance(v, pd.Timestamp):
        return v.isoformat()
    if isinstance(v, (int, float, bool, str)):
        return v
    return str(v)


def _frame_output(value: pd.DataFrame) -> ExecutionOutput:
    safe = value.head(_MAX_TABLE_ROWS).replace({np.nan: None})
    return ExecutionOutput(
        type="table",
        columns=[str(c) for c in safe.columns],
        rows=[
            {str(k): _py(v) for k, v in row.items()}
            for row in safe.to_dict(orient="records")
        ],
    )


def _series_output(value: pd.Series) -> ExecutionOutput:
    frame = value.head(_MAX_TABLE_ROWS).reset_index()
    frame.columns = [str(c) for c in frame.columns]
    return ExecutionOutput(
        type="table",
        columns=[str(c) for c in frame.columns],
        rows=[
            {str(k): _py(v) for k, v in row.items()}
            for row in frame.replace({np.nan: None}).to_dict(orient="records")
        ],
    )


def _to_output(value: Any) -> ExecutionOutput | None:
    """Render the final expression value into a notebook output."""
    if value is None:
        return None
    if isinstance(value, pd.DataFrame):
        return _frame_output(value)
    if isinstance(value, pd.Series):
        return _series_output(value)
    return ExecutionOutput(type="text", text=str(value)[:_MAX_TEXT_CHARS])


def _describe_variable(name: str, value: Any) -> VariableInfo:
    type_name = type(value).__name__
    shape = ""
    if isinstance(value, pd.DataFrame):
        shape = f"{value.shape[0]} x {value.shape[1]}"
        preview = f"columns: {', '.join(str(c) for c in value.columns[:8])}"
    elif isinstance(value, pd.Series):
        shape = str(value.shape[0])
        preview = f"dtype {value.dtype}"
    elif isinstance(value, np.ndarray):
        shape = " x ".join(str(d) for d in value.shape)
        preview = f"dtype {value.dtype}"
    elif isinstance(value, (list, tuple, set, dict)):
        shape = str(len(value))
        preview = repr(value)[:80]
    else:
        preview = repr(value)[:80]
    return VariableInfo(name=name, type=type_name, preview=preview, shape=shape)


class FullExecutor(NotebookExecutor):
    """Executes real Python with the data-science stack preloaded."""

    name = "full"
    available = True
    description = (
        "Runs real Python in-process with df, pd, np, plt, sns, px and sklearn "
        "preloaded. Captures printed output, the last expression, matplotlib "
        "figures and your defined variables."
    )

    def starter_cells(self) -> list[str]:
        return [
            "df.head()",
            "df.describe(include='all')",
            "import matplotlib.pyplot as plt\n"
            "df.select_dtypes('number').hist(figsize=(10, 6))\n"
            "plt.tight_layout()",
        ]

    def _preload(self, df: pd.DataFrame) -> dict[str, Any]:
        """Build the execution namespace with the analysis stack preloaded."""
        namespace: dict[str, Any] = {
            "__name__": "__notebook__",
            "df": df.copy(),
            "pd": pd,
            "np": np,
        }
        # matplotlib is required for figure capture; import with the Agg backend.
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        plt.close("all")
        namespace["plt"] = plt
        namespace["matplotlib"] = matplotlib

        # Optional stack members degrade gracefully when unavailable.
        try:
            import seaborn as sns

            namespace["sns"] = sns
        except Exception:  # noqa: BLE001 - optional dependency
            pass
        try:
            import plotly.express as px

            namespace["px"] = px
        except Exception:  # noqa: BLE001 - optional dependency
            pass
        try:
            import sklearn

            namespace["sklearn"] = sklearn
        except Exception:  # noqa: BLE001 - optional dependency
            pass
        return namespace

    def _capture_figures(self, plt: Any) -> list[ExecutionOutput]:
        """Render every open matplotlib figure to a base64 PNG output."""
        outputs: list[ExecutionOutput] = []
        for num in plt.get_fignums()[:_MAX_FIGURES]:
            fig = plt.figure(num)
            # Skip empty figures (no axes / no drawn content).
            if not fig.get_axes():
                continue
            buf = io.BytesIO()
            try:
                fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
            except Exception:  # noqa: BLE001 - never fail on a bad figure
                continue
            outputs.append(
                ExecutionOutput(
                    type="image",
                    image=base64.b64encode(buf.getvalue()).decode("ascii"),
                )
            )
        plt.close("all")
        return outputs

    def _capture_variables(self, namespace: dict[str, Any]) -> list[VariableInfo]:
        reserved = {"pd", "np", "plt", "sns", "px", "sklearn", "matplotlib"}
        variables: list[VariableInfo] = []
        for key, value in namespace.items():
            if key.startswith("__") or key in reserved:
                continue
            if callable(value) and not isinstance(
                value, (pd.DataFrame, pd.Series, np.ndarray)
            ):
                continue
            variables.append(_describe_variable(key, value))
            if len(variables) >= _MAX_VARIABLES:
                break
        return variables

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

        import ast

        try:
            tree = ast.parse(code, mode="exec")
        except SyntaxError as exc:
            return ExecutionResult(
                ok=False,
                error=f"SyntaxError: {exc}",
                execution_ms=int((time.perf_counter() - start) * 1000),
            )

        namespace = self._preload(df)
        plt = namespace["plt"]

        # Split off a trailing bare expression for display (Jupyter semantics).
        body = list(tree.body)
        last_expr: ast.Expr | None = None
        if body and isinstance(body[-1], ast.Expr):
            last_expr = body.pop()  # type: ignore[assignment]

        stdout = io.StringIO()
        outputs: list[ExecutionOutput] = []
        try:
            with contextlib.redirect_stdout(stdout):
                if body:
                    exec(  # noqa: S102 - intentional real execution (local app)
                        compile(ast.Module(body=body, type_ignores=[]), "<cell>", "exec"),
                        namespace,
                    )
                if last_expr is not None:
                    value = eval(  # noqa: S307 - intentional real evaluation
                        compile(ast.Expression(last_expr.value), "<cell>", "eval"),
                        namespace,
                    )
                    out = _to_output(value)
                    if out is not None:
                        outputs.append(out)
        except Exception as exc:  # noqa: BLE001 - surface runtime errors to the UI
            plt.close("all")
            return ExecutionResult(
                ok=False,
                stdout=stdout.getvalue()[:_MAX_TEXT_CHARS],
                error=f"{type(exc).__name__}: {exc}",
                execution_ms=int((time.perf_counter() - start) * 1000),
                variables=self._capture_variables(namespace),
            )

        # Figures drawn but not returned still render as image outputs.
        outputs.extend(self._capture_figures(plt))

        return ExecutionResult(
            ok=True,
            outputs=outputs,
            stdout=stdout.getvalue()[:_MAX_TEXT_CHARS],
            execution_ms=int((time.perf_counter() - start) * 1000),
            variables=self._capture_variables(namespace),
        )
