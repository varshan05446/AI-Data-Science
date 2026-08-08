"""Automated data profiling.

Produces the full profile payload consumed by the Data Profile UI:
dataset summary, per-column summary, missing-value report, dtypes, correlation
matrix, statistics, categorical analysis, target suggestions, primary-key and
date detection, outliers (IQR), duplicates and a composite Data Quality Score.

All outputs are plain JSON-serialisable Python types.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

# Heuristic thresholds
_HIGH_CARDINALITY_RATIO = 0.5
_CATEGORICAL_MAX_UNIQUE = 50
_ID_UNIQUE_RATIO = 0.95


def _py(value: Any) -> Any:
    """Coerce numpy/pandas scalars into JSON-safe Python values."""
    if value is None:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        f = float(value)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, float):
        return None if (math.isnan(value) or math.isinf(value)) else value
    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    return value


def _semantic_type(series: pd.Series) -> str:
    """Classify a column into a business-friendly semantic type."""
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    # Try to detect dates hidden in object columns.
    if series.dtype == object:
        sample = series.dropna().astype(str).head(25)
        if len(sample) and _looks_like_dates(sample):
            return "datetime"
    non_null = series.dropna()
    nunique = non_null.nunique()
    if len(non_null) and nunique / max(len(non_null), 1) <= 0.5 and nunique <= _CATEGORICAL_MAX_UNIQUE:
        return "categorical"
    return "text"


def _looks_like_dates(sample: pd.Series) -> bool:
    parsed = pd.to_datetime(sample, errors="coerce", format="mixed")
    return parsed.notna().mean() >= 0.8


def _column_summary(name: str, series: pd.Series, n_rows: int) -> dict[str, Any]:
    missing = int(series.isna().sum())
    non_null = series.dropna()
    nunique = int(non_null.nunique())
    semantic = _semantic_type(series)

    summary: dict[str, Any] = {
        "name": name,
        "dtype": str(series.dtype),
        "semantic_type": semantic,
        "missing": missing,
        "missing_pct": round(missing / n_rows * 100, 2) if n_rows else 0.0,
        "unique": nunique,
        "unique_pct": round(nunique / n_rows * 100, 2) if n_rows else 0.0,
        "is_probable_id": bool(n_rows and nunique / n_rows >= _ID_UNIQUE_RATIO and missing == 0),
    }

    if semantic == "numeric" and len(non_null):
        desc = non_null.astype(float)
        q1, q3 = np.percentile(desc, [25, 75])
        iqr = q3 - q1
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        outliers = int(((desc < lower) | (desc > upper)).sum())
        summary["stats"] = {
            "min": _py(desc.min()),
            "max": _py(desc.max()),
            "mean": _py(desc.mean()),
            "median": _py(desc.median()),
            "std": _py(desc.std()),
            "q1": _py(q1),
            "q3": _py(q3),
            "outliers": outliers,
            "outlier_pct": round(outliers / len(desc) * 100, 2),
            "zeros": int((desc == 0).sum()),
            "negatives": int((desc < 0).sum()),
        }
    elif semantic in ("categorical", "boolean", "text"):
        counts = non_null.astype(str).value_counts().head(10)
        summary["top_values"] = [
            {"value": str(k), "count": int(v), "pct": round(int(v) / n_rows * 100, 2)}
            for k, v in counts.items()
        ]
    elif semantic == "datetime":
        parsed = pd.to_datetime(non_null, errors="coerce", format="mixed")
        parsed = parsed.dropna()
        if len(parsed):
            summary["stats"] = {
                "min": _py(parsed.min()),
                "max": _py(parsed.max()),
            }
    return summary


def _correlation_matrix(numeric: pd.DataFrame) -> dict[str, Any]:
    if numeric.shape[1] < 2:
        return {"columns": [], "matrix": [], "top_pairs": []}
    corr = numeric.corr(numeric_only=True).round(3)
    cols = list(corr.columns)
    matrix = [[_py(corr.iloc[i, j]) for j in range(len(cols))] for i in range(len(cols))]

    pairs = []
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            val = corr.iloc[i, j]
            if pd.notna(val):
                pairs.append({"a": cols[i], "b": cols[j], "corr": _py(val)})
    pairs.sort(key=lambda p: abs(p["corr"]), reverse=True)
    return {"columns": cols, "matrix": matrix, "top_pairs": pairs[:8]}


def _target_suggestions(columns: list[dict], corr: dict) -> list[dict[str, Any]]:
    """Suggest likely target/label columns for modelling."""
    suggestions: list[dict[str, Any]] = []
    keywords = ("target", "label", "churn", "fraud", "revenue", "sales", "price",
                "conversion", "outcome", "status", "score", "amount", "profit")
    for col in columns:
        if col["is_probable_id"] or col["missing_pct"] > 40:
            continue
        reason = None
        confidence = 0.4
        lname = col["name"].lower()
        if any(k in lname for k in keywords):
            reason = f"Column name '{col['name']}' matches a common target pattern."
            confidence = 0.75
        elif col["semantic_type"] == "categorical" and 2 <= col["unique"] <= 10:
            reason = "Low-cardinality categorical column - suitable for classification."
            confidence = 0.6
        elif col["semantic_type"] == "numeric" and col["unique_pct"] > 5:
            reason = "Continuous numeric column - suitable for regression."
            confidence = 0.5
        if reason:
            suggestions.append(
                {
                    "column": col["name"],
                    "type": "classification"
                    if col["semantic_type"] in ("categorical", "boolean")
                    else "regression",
                    "confidence": confidence,
                    "reason": reason,
                }
            )
    suggestions.sort(key=lambda s: s["confidence"], reverse=True)
    return suggestions[:5]


def _quality_score(n_rows: int, columns: list[dict], duplicate_rows: int) -> dict[str, Any]:
    """Composite 0-100 data quality score with component breakdown."""
    if not columns:
        return {"score": 0, "grade": "F", "components": {}}

    avg_missing = float(np.mean([c["missing_pct"] for c in columns]))
    completeness = max(0.0, 100.0 - avg_missing)

    dup_pct = (duplicate_rows / n_rows * 100) if n_rows else 0.0
    uniqueness = max(0.0, 100.0 - dup_pct)

    numeric = [c for c in columns if c.get("stats") and "outlier_pct" in c["stats"]]
    avg_outlier = float(np.mean([c["stats"]["outlier_pct"] for c in numeric])) if numeric else 0.0
    validity = max(0.0, 100.0 - avg_outlier)

    # Consistency: penalise text columns that look partly numeric / mixed.
    consistency = 100.0 - min(20.0, sum(1 for c in columns if c["semantic_type"] == "text") * 2.0)

    score = round(
        0.4 * completeness + 0.25 * uniqueness + 0.2 * validity + 0.15 * consistency, 1
    )
    grade = (
        "A" if score >= 90 else "B" if score >= 80 else "C" if score >= 70
        else "D" if score >= 60 else "F"
    )
    return {
        "score": score,
        "grade": grade,
        "components": {
            "completeness": round(completeness, 1),
            "uniqueness": round(uniqueness, 1),
            "validity": round(validity, 1),
            "consistency": round(consistency, 1),
        },
    }


def profile_dataframe(df: pd.DataFrame, *, sample_rows: int = 20) -> dict[str, Any]:
    """Compute the complete profile payload for a DataFrame."""
    n_rows, n_cols = int(df.shape[0]), int(df.shape[1])
    duplicate_rows = int(df.duplicated().sum())

    columns = [_column_summary(str(c), df[c], n_rows) for c in df.columns]

    numeric_df = df.select_dtypes(include=[np.number])
    correlation = _correlation_matrix(numeric_df)

    dtype_counts: dict[str, int] = {}
    for c in columns:
        dtype_counts[c["semantic_type"]] = dtype_counts.get(c["semantic_type"], 0) + 1

    missing_report = sorted(
        [
            {"column": c["name"], "missing": c["missing"], "missing_pct": c["missing_pct"]}
            for c in columns
            if c["missing"] > 0
        ],
        key=lambda x: x["missing_pct"],
        reverse=True,
    )

    categorical = [
        {
            "column": c["name"],
            "unique": c["unique"],
            "top_values": c.get("top_values", []),
        }
        for c in columns
        if c["semantic_type"] in ("categorical", "boolean")
    ]

    date_columns = [c["name"] for c in columns if c["semantic_type"] == "datetime"]
    probable_keys = [c["name"] for c in columns if c["is_probable_id"]]

    # A small, JSON-safe sample for previews.
    sample = df.head(sample_rows).replace({np.nan: None})
    sample_records = [
        {str(k): _py(v) for k, v in row.items()} for row in sample.to_dict(orient="records")
    ]

    return {
        "dataset_summary": {
            "rows": n_rows,
            "columns": n_cols,
            "duplicate_rows": duplicate_rows,
            "duplicate_pct": round(duplicate_rows / n_rows * 100, 2) if n_rows else 0.0,
            "memory_bytes": int(df.memory_usage(deep=True).sum()),
            "total_missing_cells": int(df.isna().sum().sum()),
            "numeric_columns": int(numeric_df.shape[1]),
        },
        "columns": columns,
        "dtypes": dtype_counts,
        "missing_report": missing_report,
        "correlation": correlation,
        "categorical_analysis": categorical,
        "date_columns": date_columns,
        "probable_primary_keys": probable_keys,
        "target_suggestions": _target_suggestions(columns, correlation),
        "quality": _quality_score(n_rows, columns, duplicate_rows),
        "sample": {"columns": [str(c) for c in df.columns], "rows": sample_records},
    }
