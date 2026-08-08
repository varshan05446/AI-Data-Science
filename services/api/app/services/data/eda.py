"""Automatic EDA: generate chart specifications from a DataFrame.

Charts are returned as data + a light encoding spec that the frontend renders
(with Recharts). Each chart carries a deterministic, stats-based ``summary`` that
the AI layer later turns into a business-friendly explanation.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.services.data.profiling import _py, _semantic_type

_MAX_CHARTS = 24
_HIST_BINS = 12
_SAMPLE_CAP = 800

# Chart groups drive the frontend gallery's category filter.
GROUP_DISTRIBUTION = "Distribution"
GROUP_RELATIONSHIP = "Relationship"
GROUP_COMPOSITION = "Composition"
GROUP_TREND = "Trend"
GROUP_CORRELATION = "Correlation"


def _numeric_cols(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if _semantic_type(df[c]) == "numeric"]


def _categorical_cols(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if _semantic_type(df[c]) in ("categorical", "boolean")]


def _datetime_cols(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if _semantic_type(df[c]) == "datetime"]


def _histogram(df: pd.DataFrame, col: str) -> dict[str, Any]:
    series = pd.to_numeric(df[col], errors="coerce").dropna()
    counts, edges = np.histogram(series, bins=min(_HIST_BINS, max(3, series.nunique())))
    data = [
        {"bin": f"{edges[i]:.1f}-{edges[i + 1]:.1f}", "count": int(counts[i])}
        for i in range(len(counts))
    ]
    skew = float(series.skew()) if len(series) > 2 else 0.0
    shape = "right-skewed" if skew > 0.5 else "left-skewed" if skew < -0.5 else "roughly symmetric"
    return {
        "id": f"hist_{col}",
        "type": "histogram",
        "group": GROUP_DISTRIBUTION,
        "title": f"Distribution of {col}",
        "column": col,
        "encoding": {"x": "bin", "y": "count"},
        "data": data,
        "summary": (
            f"'{col}' ranges from {series.min():.2f} to {series.max():.2f} with a "
            f"mean of {series.mean():.2f}. The distribution is {shape} (skew={skew:.2f})."
        ),
    }


def _boxplot(df: pd.DataFrame, col: str) -> dict[str, Any]:
    s = pd.to_numeric(df[col], errors="coerce").dropna()
    q1, med, q3 = np.percentile(s, [25, 50, 75])
    iqr = q3 - q1
    lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    outliers = int(((s < lower) | (s > upper)).sum())
    return {
        "id": f"box_{col}",
        "type": "boxplot",
        "group": GROUP_DISTRIBUTION,
        "title": f"Spread and outliers of {col}",
        "column": col,
        "encoding": {},
        "data": [
            {
                "min": _py(max(s.min(), lower)),
                "q1": _py(q1),
                "median": _py(med),
                "q3": _py(q3),
                "max": _py(min(s.max(), upper)),
            }
        ],
        "summary": (
            f"The middle 50% of '{col}' lies between {q1:.2f} and {q3:.2f}. "
            f"{outliers} value(s) fall outside the typical range and may be outliers."
        ),
    }


def _scatter(df: pd.DataFrame, x: str, y: str) -> dict[str, Any]:
    sub = df[[x, y]].apply(pd.to_numeric, errors="coerce").dropna().head(500)
    corr = float(sub[x].corr(sub[y])) if len(sub) > 2 else 0.0
    strength = (
        "strong" if abs(corr) > 0.7 else "moderate" if abs(corr) > 0.4 else "weak"
    )
    direction = "positive" if corr > 0 else "negative"
    return {
        "id": f"scatter_{x}_{y}",
        "type": "scatter",
        "group": GROUP_RELATIONSHIP,
        "title": f"{y} vs {x}",
        "encoding": {"x": x, "y": y},
        "data": [{x: _py(a), y: _py(b)} for a, b in zip(sub[x], sub[y])],
        "summary": (
            f"There is a {strength} {direction} relationship between '{x}' and '{y}' "
            f"(correlation {corr:.2f})."
        ),
    }


def _category_bar(df: pd.DataFrame, col: str) -> dict[str, Any]:
    counts = df[col].astype(str).value_counts().head(10)
    total = int(df[col].notna().sum())
    top = counts.index[0] if len(counts) else None
    data = [{"category": str(k), "count": int(v)} for k, v in counts.items()]
    return {
        "id": f"cat_{col}",
        "type": "bar",
        "group": GROUP_COMPOSITION,
        "title": f"Breakdown by {col}",
        "column": col,
        "encoding": {"x": "category", "y": "count"},
        "data": data,
        "summary": (
            f"'{top}' is the most common value of '{col}', accounting for "
            f"{counts.iloc[0] / total * 100:.1f}% of records."
            if top is not None
            else f"Category breakdown of '{col}'."
        ),
    }


def _timeseries(df: pd.DataFrame, date_col: str, value_col: str) -> dict[str, Any]:
    sub = df[[date_col, value_col]].copy()
    sub[date_col] = pd.to_datetime(sub[date_col], errors="coerce", format="mixed")
    sub[value_col] = pd.to_numeric(sub[value_col], errors="coerce")
    sub = sub.dropna().sort_values(date_col)
    if sub.empty:
        return {}
    grouped = sub.groupby(sub[date_col].dt.to_period("M"))[value_col].sum()
    data = [{"period": str(p), "value": _py(v)} for p, v in grouped.items()]
    trend = "flat"
    if len(data) >= 2:
        first, last = data[0]["value"] or 0, data[-1]["value"] or 0
        if last > first * 1.05:
            trend = "an upward"
        elif last < first * 0.95:
            trend = "a downward"
        else:
            trend = "a flat"
    return {
        "id": f"ts_{value_col}",
        "type": "area",
        "group": GROUP_TREND,
        "title": f"{value_col} over time",
        "encoding": {"x": "period", "y": "value"},
        "data": data,
        "summary": f"'{value_col}' shows {trend} trend across the observed period.",
    }


def _heatmap(df: pd.DataFrame, cols: list[str]) -> dict[str, Any]:
    corr = df[cols].corr(numeric_only=True).round(2)
    cells = [
        {"x": a, "y": b, "value": _py(corr.loc[b, a])}
        for a in corr.columns
        for b in corr.index
    ]
    return {
        "id": "corr_heatmap",
        "type": "heatmap",
        "group": GROUP_CORRELATION,
        "title": "Correlation heatmap",
        "encoding": {"x": "x", "y": "y", "value": "value"},
        "data": cells,
        "columns": list(corr.columns),
        "summary": "Pairwise correlations between numeric columns. Values near +/-1 indicate strong linear relationships.",
    }


def _pie(df: pd.DataFrame, col: str) -> dict[str, Any]:
    counts = df[col].astype(str).value_counts().head(8)
    total = int(df[col].notna().sum()) or 1
    data = [{"category": str(k), "count": int(v)} for k, v in counts.items()]
    top = counts.index[0] if len(counts) else None
    return {
        "id": f"pie_{col}",
        "type": "pie",
        "group": GROUP_COMPOSITION,
        "title": f"Composition of {col}",
        "column": col,
        "encoding": {"label": "category", "value": "count"},
        "data": data,
        "summary": (
            f"'{top}' represents {counts.iloc[0] / total * 100:.1f}% of the total for '{col}'."
            if top is not None
            else f"Composition of '{col}'."
        ),
    }


def _violin(df: pd.DataFrame, num_col: str, cat_col: str) -> dict[str, Any]:
    """Distribution of a numeric column split by the top categories."""
    top_cats = df[cat_col].astype(str).value_counts().head(5).index.tolist()
    sub = df[[num_col, cat_col]].copy()
    sub[num_col] = pd.to_numeric(sub[num_col], errors="coerce")
    sub[cat_col] = sub[cat_col].astype(str)
    sub = sub[sub[cat_col].isin(top_cats)].dropna()
    if sub.empty:
        return {}
    sub = sub.head(_SAMPLE_CAP)
    data = [{"group": g, "value": _py(v)} for g, v in zip(sub[cat_col], sub[num_col])]
    return {
        "id": f"violin_{num_col}_{cat_col}",
        "type": "violin",
        "group": GROUP_DISTRIBUTION,
        "title": f"{num_col} by {cat_col}",
        "encoding": {"group": "group", "value": "value"},
        "data": data,
        "summary": (
            f"Compares the distribution of '{num_col}' across the most common "
            f"values of '{cat_col}'."
        ),
    }


def _grouped_mean_bar(df: pd.DataFrame, num_col: str, cat_col: str) -> dict[str, Any]:
    sub = df[[num_col, cat_col]].copy()
    sub[num_col] = pd.to_numeric(sub[num_col], errors="coerce")
    sub[cat_col] = sub[cat_col].astype(str)
    grouped = sub.dropna().groupby(cat_col)[num_col].mean().sort_values(ascending=False).head(10)
    if grouped.empty:
        return {}
    data = [{"category": str(k), "value": _py(round(float(v), 3))} for k, v in grouped.items()]
    top = grouped.index[0]
    return {
        "id": f"gbar_{num_col}_{cat_col}",
        "type": "bar",
        "group": GROUP_RELATIONSHIP,
        "title": f"Average {num_col} by {cat_col}",
        "encoding": {"x": "category", "y": "value"},
        "data": data,
        "summary": (
            f"'{top}' has the highest average '{num_col}' ({grouped.iloc[0]:.2f}) "
            f"among the values of '{cat_col}'."
        ),
    }


def generate_eda(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Generate a prioritised list of chart specs (deterministic, offline)."""
    charts: list[dict[str, Any]] = []
    numeric = _numeric_cols(df)
    categorical = _categorical_cols(df)
    dates = _datetime_cols(df)

    if len(numeric) >= 2:
        charts.append(_heatmap(df, numeric))

    for col in numeric[:3]:
        charts.append(_histogram(df, col))
        charts.append(_boxplot(df, col))

    # Strongest numeric pair scatter.
    if len(numeric) >= 2:
        corr = df[numeric].corr(numeric_only=True).abs()
        best = (None, None, 0.0)
        for i, a in enumerate(numeric):
            for b in numeric[i + 1 :]:
                v = corr.loc[a, b]
                if pd.notna(v) and v > best[2]:
                    best = (a, b, v)
        if best[0]:
            charts.append(_scatter(df, best[0], best[1]))

    for col in categorical[:2]:
        charts.append(_category_bar(df, col))
        charts.append(_pie(df, col))

    # Numeric-by-category comparisons (relationship + distribution).
    if numeric and categorical:
        charts.append(_grouped_mean_bar(df, numeric[0], categorical[0]))
        v = _violin(df, numeric[0], categorical[0])
        if v:
            charts.append(v)

    if dates and numeric:
        ts = _timeseries(df, dates[0], numeric[0])
        if ts:
            charts.append(ts)

    return [c for c in charts if c][:_MAX_CHARTS]
