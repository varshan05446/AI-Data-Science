"""AI data-cleaning suggestions.

Per the product philosophy, we SUGGEST fixes rather than silently mutating data.
Each suggestion is an approvable recommendation with a clear rationale; applying
them is handled in a later phase.
"""
from __future__ import annotations

from typing import Any


def suggest_cleaning_actions(profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Derive approvable cleaning recommendations from a profile payload."""
    suggestions: list[dict[str, Any]] = []
    summary = profile.get("dataset_summary", {})

    # Missing values
    for item in profile.get("missing_report", []):
        col, pct = item["column"], item["missing_pct"]
        if pct >= 60:
            action, rationale = "drop_column", (
                f"'{col}' is {pct}% empty and unlikely to be useful."
            )
        elif pct >= 5:
            action, rationale = "impute", (
                f"Fill the {pct}% missing values in '{col}' (median for numeric, mode for "
                "categorical)."
            )
        else:
            action, rationale = "impute", (
                f"'{col}' has a few missing values ({pct}%); a simple imputation is safe."
            )
        suggestions.append(
            {
                "id": f"missing::{col}",
                "type": "missing_values",
                "column": col,
                "action": action,
                "rationale": rationale,
                "severity": "high" if pct >= 40 else "medium" if pct >= 5 else "low",
                "auto_safe": pct < 5,
            }
        )

    # Duplicate rows
    if summary.get("duplicate_rows", 0) > 0:
        suggestions.append(
            {
                "id": "duplicates::rows",
                "type": "duplicates",
                "column": None,
                "action": "drop_duplicates",
                "rationale": f"Remove {summary['duplicate_rows']} exact duplicate row(s).",
                "severity": "medium",
                "auto_safe": False,
            }
        )

    for col in profile.get("columns", []):
        stats = col.get("stats") or {}
        # Outliers
        if stats.get("outlier_pct", 0) >= 5:
            suggestions.append(
                {
                    "id": f"outliers::{col['name']}",
                    "type": "outliers",
                    "column": col["name"],
                    "action": "review_or_cap",
                    "rationale": f"{stats['outlier_pct']}% of values look like outliers; "
                    "review before capping.",
                    "severity": "medium",
                    "auto_safe": False,
                }
            )
        # Type mismatch: text column that looks like it should be a date.
        if col["semantic_type"] == "text" and any(
            k in col["name"].lower() for k in ("date", "time", "day", "month", "year")
        ):
            suggestions.append(
                {
                    "id": f"dtype::{col['name']}",
                    "type": "wrong_data_type",
                    "column": col["name"],
                    "action": "parse_datetime",
                    "rationale": f"'{col['name']}' is stored as text but looks like a date; "
                    "parse it to a datetime type.",
                    "severity": "low",
                    "auto_safe": True,
                }
            )

    return suggestions
