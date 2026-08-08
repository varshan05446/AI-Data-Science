"""Business prediction-objective recommendations for the Model Studio.

Turns a dataset profile report into ranked, business-framed objectives such as
"Predict Customer Churn" instead of asking the user for a target column. Each
objective carries the mapped target column, the inferred problem type, a plain
language "why", an estimated difficulty, a data-quality score and a business
value tag - everything the objective cards in the UI need.

Fully deterministic and offline (no LLM), mirroring the advisor's design.
"""
from __future__ import annotations

import re
from typing import Any

# Column-name templates mapped to business framings. First match wins; order
# encodes specificity (e.g. "lifetime" before generic "value"/"amount").
_TEMPLATES: list[dict[str, Any]] = [
    {"keywords": ("churn",), "title": "Predict Customer Churn", "value": "high",
     "why": "Identifying customers likely to leave lets you act before they do."},
    {"keywords": ("attrition",), "title": "Predict Employee Attrition", "value": "high",
     "why": "Spotting flight-risk employees early reduces hiring and training costs."},
    {"keywords": ("fraud",), "title": "Detect Fraudulent Activity", "value": "high",
     "why": "Flagging suspicious records automatically prevents direct financial loss."},
    {"keywords": ("default", "delinquen"), "title": "Predict Loan Default", "value": "high",
     "why": "Estimating repayment risk improves lending decisions and pricing."},
    {"keywords": ("ltv", "lifetime"), "title": "Predict Customer Lifetime Value", "value": "high",
     "why": "Knowing long-term customer value focuses retention and acquisition spend."},
    {"keywords": ("claim",), "title": "Predict Insurance Claim Cost", "value": "high",
     "why": "Anticipating claim amounts sharpens reserving and premium pricing."},
    {"keywords": ("demand",), "title": "Forecast Product Demand", "value": "high",
     "why": "Demand forecasts reduce stock-outs and excess inventory."},
    {"keywords": ("sales",), "title": "Predict Sales", "value": "high",
     "why": "Sales predictions drive planning, budgeting and territory decisions."},
    {"keywords": ("revenue",), "title": "Predict Revenue", "value": "high",
     "why": "Revenue forecasts anchor financial planning and growth targets."},
    {"keywords": ("price",), "title": "Predict Price", "value": "high",
     "why": "Accurate price estimates support valuation and pricing strategy."},
    {"keywords": ("conversion",), "title": "Predict Conversion", "value": "medium",
     "why": "Conversion likelihood helps prioritise leads and optimise funnels."},
    {"keywords": ("satisfaction", "rating"), "title": "Predict Customer Satisfaction", "value": "medium",
     "why": "Satisfaction drivers reveal where to improve the customer experience."},
    {"keywords": ("salary", "income", "wage"), "title": "Predict Income", "value": "medium",
     "why": "Income estimates support segmentation and eligibility decisions."},
    {"keywords": ("profit",), "title": "Predict Profit", "value": "high",
     "why": "Profit predictions expose which factors actually drive margin."},
    {"keywords": ("cancel",), "title": "Predict Cancellations", "value": "medium",
     "why": "Knowing who is likely to cancel enables timely retention offers."},
    {"keywords": ("outcome", "target", "label"), "title": None, "value": "medium",
     "why": "This column looks like the labelled outcome this dataset was built around."},
]

_VALUE_RANK = {"high": 0, "medium": 1, "low": 2}


def _humanize(name: str) -> str:
    """`SalePrice` / `monthly_charges` -> `Sale Price` / `Monthly Charges`."""
    spaced = re.sub(r"[_\-.]+", " ", name)
    spaced = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", spaced)
    return " ".join(w.capitalize() for w in spaced.split())


def _infer_task_from_profile(col: dict[str, Any]) -> str:
    """Mirror :func:`automl.infer_task` using profile stats only."""
    sem = col.get("semantic_type", "")
    unique = int(col.get("unique", 0))
    if sem in ("categorical", "boolean", "text"):
        return "classification"
    if unique <= 2:
        return "classification"
    if unique <= 20 and float(col.get("unique_pct", 100.0)) < 5.0:
        return "classification"
    return "regression"


def _difficulty(col: dict[str, Any], n_rows: int, task: str) -> str:
    """Rough easy/medium/hard estimate from rows, missingness and balance."""
    score = 0
    if n_rows < 200:
        score += 2
    elif n_rows < 1000:
        score += 1
    missing = float(col.get("missing_pct", 0.0))
    if missing > 20:
        score += 2
    elif missing > 5:
        score += 1
    if task == "classification":
        unique = int(col.get("unique", 0))
        if unique > 10:
            score += 1
        top = col.get("top_values") or []
        if top and n_rows and float(top[0].get("pct", 0.0)) >= 90.0:
            score += 2  # severe class imbalance
    if score >= 3:
        return "hard"
    if score >= 1:
        return "medium"
    return "easy"


def _data_quality(col: dict[str, Any], overall_quality: float) -> int:
    """0-100 quality for this objective: target completeness x dataset quality."""
    completeness = max(0.0, 100.0 - float(col.get("missing_pct", 0.0)))
    return int(round(0.6 * completeness + 0.4 * overall_quality))


def _match_template(name: str) -> dict[str, Any] | None:
    lname = name.lower()
    for tpl in _TEMPLATES:
        if any(k in lname for k in tpl["keywords"]):
            return tpl
    return None


def build_objectives(report: dict[str, Any]) -> list[dict[str, Any]]:
    """Rank business prediction objectives from a dataset profile report."""
    columns: list[dict[str, Any]] = report.get("columns", [])
    n_rows = int(report.get("dataset_summary", {}).get("rows", 0))
    overall_quality = float(report.get("quality", {}).get("score", 70.0))

    objectives: list[dict[str, Any]] = []
    for col in columns:
        name = col.get("name", "")
        if not name or col.get("is_probable_id") or float(col.get("missing_pct", 0.0)) > 40:
            continue
        sem = col.get("semantic_type", "")
        unique = int(col.get("unique", 0))
        # Free text and constant columns are not viable targets.
        if sem == "text" or sem == "datetime" or unique <= 1:
            continue

        task = _infer_task_from_profile(col)
        tpl = _match_template(name)
        matched = tpl is not None

        if tpl is not None:
            title = tpl["title"] or f"Predict {_humanize(name)}"
            value = tpl["value"]
            why = tpl["why"]
        else:
            # Generic fallback only for plausible targets (mirrors profiling).
            if sem in ("categorical", "boolean") and 2 <= unique <= 10:
                why = (
                    f"'{_humanize(name)}' has {unique} distinct outcomes - a natural "
                    "classification label."
                )
            elif sem == "numeric" and float(col.get("unique_pct", 0.0)) > 5.0:
                why = (
                    f"'{_humanize(name)}' is a continuous measure this data could "
                    "explain and forecast."
                )
            else:
                continue
            title = f"Predict {_humanize(name)}"
            value = "medium" if task == "classification" else "low"

        objectives.append(
            {
                "id": f"obj_{re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')}",
                "title": title,
                "target": name,
                "task": task,
                "why": why,
                "difficulty": _difficulty(col, n_rows, task),
                "data_quality": _data_quality(col, overall_quality),
                "business_value": value,
                "recommended": False,
                "_matched": matched,
            }
        )

    objectives.sort(
        key=lambda o: (0 if o["_matched"] else 1, _VALUE_RANK[o["business_value"]], -o["data_quality"])
    )
    objectives = objectives[:6]
    for obj in objectives:
        obj.pop("_matched", None)
    if objectives:
        objectives[0]["recommended"] = True
    return objectives


def dataset_ml_summary(report: dict[str, Any]) -> dict[str, Any]:
    """Compact dataset readiness summary for Model Studio's Analyze step."""
    ds = report.get("dataset_summary", {})
    quality = report.get("quality", {})
    columns: list[dict[str, Any]] = report.get("columns", [])
    n_rows = int(ds.get("rows", 0))
    n_cols = int(ds.get("columns", 0))
    total_cells = max(1, n_rows * n_cols)
    missing_pct = round(float(ds.get("total_missing_cells", 0)) / total_cells * 100, 2)

    issues: list[str] = []
    if n_rows < 200:
        issues.append(f"Small dataset ({n_rows} rows) - predictions may be unstable.")
    high_missing = [c["name"] for c in columns if float(c.get("missing_pct", 0)) > 30]
    if high_missing:
        preview = ", ".join(high_missing[:3])
        more = "" if len(high_missing) <= 3 else f" (+{len(high_missing) - 3} more)"
        issues.append(f"High missing values in {preview}{more}.")
    dup_pct = float(ds.get("duplicate_pct", 0.0))
    if dup_pct > 1:
        issues.append(f"{dup_pct:.1f}% duplicate rows detected.")
    ids = report.get("probable_primary_keys", [])
    if ids:
        issues.append(f"Identifier column(s) excluded from modelling: {', '.join(ids[:3])}.")
    text_cols = [c["name"] for c in columns if c.get("semantic_type") == "text"]
    if text_cols:
        issues.append(f"Free-text column(s) will be skipped: {', '.join(text_cols[:3])}.")

    return {
        "rows": n_rows,
        "columns": n_cols,
        "missing_pct": missing_pct,
        "duplicate_pct": dup_pct,
        "quality_score": float(quality.get("score", 0.0)),
        "quality_grade": str(quality.get("grade", "-")),
        "issues": issues,
    }
