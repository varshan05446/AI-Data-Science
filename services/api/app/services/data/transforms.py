"""Data-cleaning transform engine.

A registry of pure, deterministic operations that each take a DataFrame plus a
small parameter dict and return a *new* DataFrame. The cleaning workspace stores
an ordered list of these operation specs (the "pipeline"); the current working
DataFrame is always derived by replaying the pipeline over the original file, so
undo/redo/version-history are cheap and reproducible.

Every operation is registered with UI metadata (label, group, parameter schema)
so the frontend can render menus without hard-coding the catalogue.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

import numpy as np
import pandas as pd

from app.services.data.profiling import _column_summary, _py

# An operation spec: {"op": "fill_missing", "column": "x", "params": {...}}
OpSpec = dict[str, Any]
Handler = Callable[[pd.DataFrame, str | None, dict[str, Any]], pd.DataFrame]


class TransformError(ValueError):
    """Raised when an operation cannot be applied (bad column, params, etc.)."""


@dataclass
class Operation:
    op: str
    label: str
    group: str
    handler: Handler
    scope: str = "column"  # "column" | "dataset"
    params: list[dict[str, Any]] = field(default_factory=list)

    def meta(self) -> dict[str, Any]:
        return {
            "op": self.op,
            "label": self.label,
            "group": self.group,
            "scope": self.scope,
            "params": self.params,
        }


_REGISTRY: dict[str, Operation] = {}


def _register(op: Operation) -> Operation:
    _REGISTRY[op.op] = op
    return op


def _require_column(df: pd.DataFrame, column: str | None) -> str:
    if not column or column not in df.columns:
        raise TransformError(f"Column '{column}' not found.")
    return column


# --- Missing values -----------------------------------------------------------


def _fill_missing(df: pd.DataFrame, column: str | None, params: dict) -> pd.DataFrame:
    col = _require_column(df, column)
    method = params.get("method", "median")
    out = df.copy()
    s = out[col]
    if method == "mean":
        out[col] = s.fillna(pd.to_numeric(s, errors="coerce").mean())
    elif method == "median":
        out[col] = s.fillna(pd.to_numeric(s, errors="coerce").median())
    elif method == "mode":
        mode = s.mode(dropna=True)
        out[col] = s.fillna(mode.iloc[0] if len(mode) else s)
    elif method == "custom":
        out[col] = s.fillna(params.get("value"))
    elif method == "ffill":
        out[col] = s.ffill()
    elif method == "bfill":
        out[col] = s.bfill()
    else:
        raise TransformError(f"Unknown fill method '{method}'.")
    return out


def _drop_missing_rows(df: pd.DataFrame, column: str | None, params: dict) -> pd.DataFrame:
    if column and column in df.columns:
        return df.dropna(subset=[column])
    return df.dropna()


def _drop_column(df: pd.DataFrame, column: str | None, params: dict) -> pd.DataFrame:
    col = _require_column(df, column)
    return df.drop(columns=[col])


# --- Duplicates ---------------------------------------------------------------


def _drop_duplicates(df: pd.DataFrame, column: str | None, params: dict) -> pd.DataFrame:
    keep = params.get("keep", "first")
    keep_val: Any = False if keep in ("none", "false", False) else keep
    subset = [column] if column and column in df.columns else None
    return df.drop_duplicates(subset=subset, keep=keep_val)


# --- Type conversion ----------------------------------------------------------


def _convert_type(df: pd.DataFrame, column: str | None, params: dict) -> pd.DataFrame:
    col = _require_column(df, column)
    to = params.get("to", "string")
    out = df.copy()
    s = out[col]
    try:
        if to in ("int", "integer"):
            out[col] = pd.to_numeric(s, errors="coerce").astype("Int64")
        elif to == "float":
            out[col] = pd.to_numeric(s, errors="coerce").astype(float)
        elif to in ("bool", "boolean"):
            out[col] = s.map(_to_bool).astype("boolean")
        elif to in ("category",):
            out[col] = s.astype("category")
        elif to in ("date", "datetime"):
            out[col] = pd.to_datetime(s, errors="coerce", format="mixed")
        else:  # string
            out[col] = s.astype(str)
    except Exception as exc:  # noqa: BLE001
        raise TransformError(f"Could not convert '{col}' to {to}: {exc}") from exc
    return out


def _to_bool(v: Any) -> Any:
    if pd.isna(v):
        return pd.NA
    s = str(v).strip().lower()
    if s in ("true", "1", "yes", "y", "t"):
        return True
    if s in ("false", "0", "no", "n", "f"):
        return False
    return pd.NA


# --- Outliers -----------------------------------------------------------------


def _numeric(df: pd.DataFrame, col: str) -> pd.Series:
    s = pd.to_numeric(df[col], errors="coerce")
    if s.notna().sum() == 0:
        raise TransformError(f"'{col}' is not numeric.")
    return s


def _handle_outliers(df: pd.DataFrame, column: str | None, params: dict) -> pd.DataFrame:
    col = _require_column(df, column)
    method = params.get("method", "iqr_remove")
    out = df.copy()
    s = _numeric(out, col)

    if method in ("iqr_remove", "cap"):
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        iqr = q3 - q1
        lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        if method == "cap":
            out[col] = s.clip(lo, hi)
            return out
        mask = (s >= lo) & (s <= hi)
        return out[mask | s.isna()]
    if method == "zscore_remove":
        z = (s - s.mean()) / (s.std(ddof=0) or 1)
        return out[(z.abs() <= 3) | s.isna()]
    if method == "winsorize":
        p = float(params.get("limit", 0.05))
        lo, hi = s.quantile(p), s.quantile(1 - p)
        out[col] = s.clip(lo, hi)
        return out
    if method == "replace_median":
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        iqr = q3 - q1
        lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        med = s.median()
        out[col] = s.where((s >= lo) & (s <= hi), med)
        return out
    raise TransformError(f"Unknown outlier method '{method}'.")


# --- String operations --------------------------------------------------------


def _string_op(df: pd.DataFrame, column: str | None, params: dict) -> pd.DataFrame:
    col = _require_column(df, column)
    op = params.get("op", "trim")
    out = df.copy()
    s = out[col].astype("string")
    if op == "trim":
        out[col] = s.str.strip()
    elif op == "lower":
        out[col] = s.str.lower()
    elif op == "upper":
        out[col] = s.str.upper()
    elif op == "title":
        out[col] = s.str.title()
    elif op == "replace":
        out[col] = s.str.replace(params.get("find", ""), params.get("replace", ""), regex=False)
    elif op == "regex_replace":
        out[col] = s.str.replace(params.get("pattern", ""), params.get("replace", ""), regex=True)
    elif op == "split":
        sep = params.get("separator", " ")
        idx = int(params.get("index", 0))
        out[col] = s.str.split(sep).str[idx]
    else:
        raise TransformError(f"Unknown string op '{op}'.")
    return out


def _merge_columns(df: pd.DataFrame, column: str | None, params: dict) -> pd.DataFrame:
    cols = params.get("columns", [])
    missing = [c for c in cols if c not in df.columns]
    if len(cols) < 2 or missing:
        raise TransformError("Provide at least two existing columns to merge.")
    sep = params.get("separator", "_")
    new_name = params.get("new_name") or "_".join(cols)
    out = df.copy()
    out[new_name] = out[cols].astype(str).agg(sep.join, axis=1)
    return out


# --- Date operations ----------------------------------------------------------


def _date_extract(df: pd.DataFrame, column: str | None, params: dict) -> pd.DataFrame:
    col = _require_column(df, column)
    part = params.get("part", "year")
    out = df.copy()
    dt = pd.to_datetime(out[col], errors="coerce", format="mixed")
    new = f"{col}_{part}"
    if part == "year":
        out[new] = dt.dt.year
    elif part == "month":
        out[new] = dt.dt.month
    elif part == "quarter":
        out[new] = dt.dt.quarter
    elif part == "week":
        out[new] = dt.dt.isocalendar().week.astype("Int64")
    elif part == "day":
        out[new] = dt.dt.day
    elif part == "dayofweek":
        out[new] = dt.dt.dayofweek
    elif part == "hour":
        out[new] = dt.dt.hour
    else:
        raise TransformError(f"Unknown date part '{part}'.")
    return out


# --- Feature engineering ------------------------------------------------------


def _one_hot(df: pd.DataFrame, column: str | None, params: dict) -> pd.DataFrame:
    col = _require_column(df, column)
    dummies = pd.get_dummies(df[col], prefix=col, dtype=int)
    return pd.concat([df.drop(columns=[col]), dummies], axis=1)


def _label_encode(df: pd.DataFrame, column: str | None, params: dict) -> pd.DataFrame:
    col = _require_column(df, column)
    out = df.copy()
    out[col] = out[col].astype("category").cat.codes.replace(-1, np.nan)
    return out


def _scale_standard(df: pd.DataFrame, column: str | None, params: dict) -> pd.DataFrame:
    col = _require_column(df, column)
    out = df.copy()
    s = _numeric(out, col)
    std = s.std(ddof=0) or 1
    out[col] = (s - s.mean()) / std
    return out


def _normalize_minmax(df: pd.DataFrame, column: str | None, params: dict) -> pd.DataFrame:
    col = _require_column(df, column)
    out = df.copy()
    s = _numeric(out, col)
    rng = (s.max() - s.min()) or 1
    out[col] = (s - s.min()) / rng
    return out


def _log_transform(df: pd.DataFrame, column: str | None, params: dict) -> pd.DataFrame:
    col = _require_column(df, column)
    out = df.copy()
    s = _numeric(out, col)
    out[col] = np.log1p(s.clip(lower=0))
    return out


def _rename_column(df: pd.DataFrame, column: str | None, params: dict) -> pd.DataFrame:
    col = _require_column(df, column)
    new = params.get("to", "").strip()
    if not new:
        raise TransformError("Provide a new column name.")
    return df.rename(columns={col: new})


# --- Registry -----------------------------------------------------------------

_register(Operation("fill_missing", "Fill missing values", "Missing Values", _fill_missing,
                     params=[{"name": "method", "type": "select",
                              "options": ["mean", "median", "mode", "custom", "ffill", "bfill"]},
                             {"name": "value", "type": "text", "when": {"method": "custom"}}]))
_register(Operation("drop_missing_rows", "Remove rows with missing", "Missing Values",
                    _drop_missing_rows))
_register(Operation("drop_column", "Remove column", "Missing Values", _drop_column))
_register(Operation("drop_duplicates", "Remove duplicates", "Duplicates", _drop_duplicates,
                     scope="dataset",
                     params=[{"name": "keep", "type": "select", "options": ["first", "last", "none"]}]))
_register(Operation("convert_type", "Convert type", "Data Types", _convert_type,
                     params=[{"name": "to", "type": "select",
                              "options": ["integer", "float", "boolean", "category", "date", "string"]}]))
_register(Operation("handle_outliers", "Handle outliers", "Outliers", _handle_outliers,
                     params=[{"name": "method", "type": "select",
                              "options": ["iqr_remove", "zscore_remove", "winsorize", "cap", "replace_median"]}]))
_register(Operation("string_op", "String operation", "Text", _string_op,
                     params=[{"name": "op", "type": "select",
                              "options": ["trim", "lower", "upper", "title", "replace", "regex_replace", "split"]},
                             {"name": "find", "type": "text", "when": {"op": "replace"}},
                             {"name": "replace", "type": "text"},
                             {"name": "pattern", "type": "text", "when": {"op": "regex_replace"}},
                             {"name": "separator", "type": "text", "when": {"op": "split"}},
                             {"name": "index", "type": "number", "when": {"op": "split"}}]))
_register(Operation("merge_columns", "Merge columns", "Text", _merge_columns, scope="dataset",
                     params=[{"name": "columns", "type": "columns"},
                             {"name": "separator", "type": "text"},
                             {"name": "new_name", "type": "text"}]))
_register(Operation("date_extract", "Extract date part", "Dates", _date_extract,
                     params=[{"name": "part", "type": "select",
                              "options": ["year", "month", "quarter", "week", "day", "dayofweek", "hour"]}]))
_register(Operation("one_hot_encode", "One-hot encode", "Feature Engineering", _one_hot))
_register(Operation("label_encode", "Label encode", "Feature Engineering", _label_encode))
_register(Operation("scale_standard", "Standard scale", "Feature Engineering", _scale_standard))
_register(Operation("normalize_minmax", "Normalize (min-max)", "Feature Engineering", _normalize_minmax))
_register(Operation("log_transform", "Log transform", "Feature Engineering", _log_transform))
_register(Operation("rename_column", "Rename column", "Feature Engineering", _rename_column,
                     params=[{"name": "to", "type": "text"}]))


# --- Public API ---------------------------------------------------------------


def operation_catalog() -> list[dict[str, Any]]:
    """Group registered operations for the UI menu."""
    groups: dict[str, list[dict[str, Any]]] = {}
    for op in _REGISTRY.values():
        groups.setdefault(op.group, []).append(op.meta())
    order = ["Missing Values", "Duplicates", "Data Types", "Outliers", "Text",
             "Dates", "Feature Engineering"]
    return [
        {"group": g, "operations": groups[g]}
        for g in order
        if g in groups
    ]


def apply_operation(df: pd.DataFrame, spec: OpSpec) -> pd.DataFrame:
    """Apply a single operation spec, returning a new DataFrame."""
    name = spec.get("op")
    op = _REGISTRY.get(name or "")
    if op is None:
        raise TransformError(f"Unknown operation '{name}'.")
    result = op.handler(df, spec.get("column"), spec.get("params") or {})
    return result.reset_index(drop=True)


def apply_pipeline(df: pd.DataFrame, steps: list[OpSpec]) -> pd.DataFrame:
    """Replay an ordered list of operations over a DataFrame."""
    out = df
    for step in steps:
        out = apply_operation(out, step)
    return out


def describe_step(spec: OpSpec) -> str:
    """A short human-readable label for a pipeline step."""
    op = _REGISTRY.get(spec.get("op", ""))
    label = op.label if op else spec.get("op", "operation")
    col = spec.get("column")
    params = spec.get("params") or {}
    detail = params.get("method") or params.get("to") or params.get("op") or params.get("part")
    parts = [label]
    if col:
        parts.append(f"· {col}")
    if detail:
        parts.append(f"({detail})")
    return " ".join(parts)


def grid_preview(df: pd.DataFrame, *, head: int = 50) -> dict[str, Any]:
    """Build the spreadsheet preview: per-column stats + a head sample."""
    n_rows = int(df.shape[0])
    columns = []
    for c in df.columns:
        summary = _column_summary(str(c), df[c], n_rows)
        summary["memory_bytes"] = int(df[c].memory_usage(deep=True))
        columns.append(summary)

    sample = df.head(head).replace({np.nan: None})
    rows = [
        {str(k): (None if pd.isna(v) else _py(v)) for k, v in row.items()}
        for row in sample.to_dict(orient="records")
    ]
    return {
        "shape": {"rows": n_rows, "columns": int(df.shape[1])},
        "columns": columns,
        "column_order": [str(c) for c in df.columns],
        "rows": rows,
        "memory_bytes": int(df.memory_usage(deep=True).sum()),
        "duplicate_rows": int(df.duplicated().sum()),
    }
