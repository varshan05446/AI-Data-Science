"""Professional report builder.

Builds structured report *documents* (title + sections of typed blocks) from
the stored profile, the insight pipeline, the cleaning session and completed
model runs. The same document renders to Markdown, HTML, PDF, Word and
PowerPoint via the sibling renderer/exporter modules, so every format stays
consistent.

Block types: p (paragraph), kv (key/value facts), table, list, callout.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Dataset, ModelRun
from app.models.cleaning import CleaningSession

BRAND = "DataMind AI"

REPORT_TITLES = {
    "executive": "Executive Report",
    "data_analysis": "Data Analysis Report",
    "model": "Model Report",
    "ai_insight": "AI Insight Report",
}


def _p(text: str) -> dict[str, Any]:
    return {"type": "p", "text": text}


def _kv(items: list[tuple[str, Any]]) -> dict[str, Any]:
    return {"type": "kv", "items": [[k, str(v)] for k, v in items]}


def _table(columns: list[str], rows: list[list[Any]]) -> dict[str, Any]:
    return {"type": "table", "columns": columns, "rows": [[str(c) for c in r] for r in rows]}


def _list(items: list[str], ordered: bool = False) -> dict[str, Any]:
    return {"type": "list", "items": items, "ordered": ordered}


def _callout(text: str) -> dict[str, Any]:
    return {"type": "callout", "text": text}


def _section(heading: str, blocks: list[dict[str, Any]]) -> dict[str, Any]:
    return {"heading": heading, "blocks": [b for b in blocks if b]}


def collect_context(db: Session, dataset: Dataset, profile: dict, insights: list[dict]) -> dict:
    """Gather everything the builders need in one pass."""
    session = db.scalar(
        select(CleaningSession).where(CleaningSession.dataset_id == dataset.id)
    )
    runs = list(
        db.scalars(
            select(ModelRun)
            .where(ModelRun.dataset_id == dataset.id)
            .order_by(ModelRun.created_at.desc())
        )
    )
    return {
        "dataset": dataset,
        "profile": profile or {},
        "insights": insights or [],
        "cleaning_steps": list(session.steps or []) if session else [],
        "runs": runs,
        "latest_run": runs[0] if runs else None,
    }


def build_report(report_type: str, ctx: dict) -> dict[str, Any]:
    builder = {
        "executive": _build_executive,
        "data_analysis": _build_data_analysis,
        "model": _build_model,
        "ai_insight": _build_ai_insight,
    }[report_type]
    dataset: Dataset = ctx["dataset"]
    doc = {
        "brand": BRAND,
        "report_type": report_type,
        "title": REPORT_TITLES[report_type],
        "subtitle": dataset.name,
        "dataset_id": dataset.id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sections": builder(ctx),
    }
    return doc


# --- Executive ---------------------------------------------------------------
def _build_executive(ctx: dict) -> list[dict]:
    dataset: Dataset = ctx["dataset"]
    profile, insights = ctx["profile"], ctx["insights"]
    s = profile.get("dataset_summary", {})
    q = profile.get("quality", {})
    run: ModelRun | None = ctx["latest_run"]

    findings = [
        f"{i.get('title', 'Finding')} — {i.get('what_we_found', '')} "
        f"(confidence {int(float(i.get('confidence', 0)) * 100)}%)"
        for i in insights[:5]
    ]
    recommendations = [i.get("recommendation", "") for i in insights[:5] if i.get("recommendation")]
    risks = _derive_risks(profile, insights)

    kpis: list[tuple[str, Any]] = [
        ("Records analyzed", f"{s.get('rows', 0):,}"),
        ("Attributes", s.get("columns", 0)),
        ("Data quality", f"{q.get('grade', 'n/a')} ({q.get('score', 0)}/100)"),
        ("Insights surfaced", len(insights)),
    ]
    if run is not None:
        kpis.append(
            (
                "Best predictive model",
                f"{run.best_model_label} ({run.primary_metric}: {run.primary_score:.3f})",
            )
        )

    summary = (
        f"This report summarizes the analysis of '{dataset.name}': "
        f"{s.get('rows', 0):,} records across {s.get('columns', 0)} attributes, with an overall "
        f"data-quality grade of {q.get('grade', 'n/a')}. "
        f"{len(insights)} noteworthy patterns were identified by automated analysis."
    )
    if run is not None:
        advisor = (run.result or {}).get("advisor") or {}
        summary += (
            f" A predictive model for '{run.target}' was trained and validated; "
            f"the strongest performer was {run.best_model_label}."
        )
        conclusion = advisor.get("business_summary") or advisor.get("summary") or ""
    else:
        conclusion = (
            "No predictive model has been trained yet. Training one against the recommended "
            "target would convert these findings into forward-looking predictions."
        )

    return [
        _section("Executive Summary", [_p(summary)]),
        _section(
            "Business Objective",
            [
                _p(
                    "Understand the drivers hidden in the data, quantify data health, and surface "
                    "actionable opportunities and risks that leadership can act on."
                )
            ],
        ),
        _section(
            "Dataset Overview",
            [
                _kv(
                    [
                        ("Dataset", dataset.name),
                        ("Rows", f"{s.get('rows', 0):,}"),
                        ("Columns", s.get("columns", 0)),
                        ("Duplicate rows", f"{s.get('duplicate_rows', 0)} ({s.get('duplicate_pct', 0)}%)"),
                        ("Missing cells", f"{s.get('total_missing_cells', 0):,}"),
                        ("Quality grade", f"{q.get('grade', 'n/a')} ({q.get('score', 0)}/100)"),
                    ]
                )
            ],
        ),
        _section("Top KPIs", [_kv(kpis)]),
        _section("Key Findings", [_list(findings) if findings else _p("No automated findings available yet.")]),
        _section(
            "Business Recommendations",
            [_list(recommendations) if recommendations else _p("Run the insight engine to generate recommendations.")],
        ),
        _section("Potential Risks", [_list(risks) if risks else _p("No material data risks detected.")]),
        _section(
            "Next Steps",
            [
                _list(
                    [
                        "Validate the key findings with domain owners.",
                        "Address the data-quality issues listed under Potential Risks.",
                        "Operationalize the best model into the decision workflow."
                        if run is not None
                        else "Train a predictive model on the recommended target column.",
                        "Schedule a recurring refresh of this report as new data arrives.",
                    ]
                )
            ],
        ),
        _section("AI Conclusion", [_callout(conclusion)] if conclusion else [_p("—")]),
    ]


def _derive_risks(profile: dict, insights: list[dict]) -> list[str]:
    risks: list[str] = []
    s = profile.get("dataset_summary", {})
    if float(s.get("duplicate_pct", 0)) > 1:
        risks.append(
            f"Duplicate records ({s.get('duplicate_pct', 0)}%) may inflate counts and bias conclusions."
        )
    missing = profile.get("missing_report", [])
    heavy = [m for m in missing if float(m.get("missing_pct", 0)) > 20]
    if heavy:
        cols = ", ".join(m["column"] for m in heavy[:3])
        risks.append(f"High missingness in {cols} weakens any analysis relying on those fields.")
    for col in profile.get("columns", []):
        if col.get("numeric_stats", {}).get("outlier_pct", 0) and float(
            col["numeric_stats"]["outlier_pct"]
        ) > 5:
            risks.append(
                f"Column '{col['name']}' contains {col['numeric_stats']['outlier_pct']}% outliers "
                "that could distort averages."
            )
            break
    for i in insights:
        if str(i.get("severity", "")).lower() in ("high", "critical"):
            risks.append(f"{i.get('title', 'Insight')}: {i.get('business_impact', '')}")
    return risks[:6]


# --- Data analysis -----------------------------------------------------------
def _build_data_analysis(ctx: dict) -> list[dict]:
    profile = ctx["profile"]
    s = profile.get("dataset_summary", {})
    q = profile.get("quality", {})
    steps = ctx["cleaning_steps"]

    missing_rows = [
        [m.get("column", ""), m.get("missing", 0), f"{m.get('missing_pct', 0)}%"]
        for m in profile.get("missing_report", [])[:12]
    ]

    col_rows = []
    outlier_rows = []
    for col in profile.get("columns", [])[:40]:
        stats = col.get("numeric_stats") or {}
        col_rows.append(
            [
                col.get("name", ""),
                col.get("semantic_type", col.get("dtype", "")),
                f"{col.get('missing_pct', 0)}%",
                col.get("unique", 0),
                stats.get("mean", "—"),
                stats.get("std", "—"),
            ]
        )
        if stats.get("outliers"):
            outlier_rows.append(
                [col.get("name", ""), stats.get("outliers", 0), f"{stats.get('outlier_pct', 0)}%"]
            )

    corr_rows = [
        [p.get("a", ""), p.get("b", ""), p.get("corr", 0)]
        for p in profile.get("correlation", {}).get("top_pairs", [])[:8]
    ]

    cleaning_blocks: list[dict] = []
    if steps:
        cleaning_blocks.append(
            _list([str(st.get("label") or st.get("op") or "step") for st in steps[:15]], ordered=True)
        )
    else:
        cleaning_blocks.append(_p("No cleaning operations have been applied to this dataset."))

    eda_summary = (
        f"The dataset holds {s.get('rows', 0):,} rows and {s.get('columns', 0)} columns "
        f"({s.get('numeric_columns', 0)} numeric). Quality scores "
        f"{q.get('score', 0)}/100 (grade {q.get('grade', 'n/a')}): completeness "
        f"{q.get('components', {}).get('completeness', '—')}, uniqueness "
        f"{q.get('components', {}).get('uniqueness', '—')}, validity "
        f"{q.get('components', {}).get('validity', '—')}."
    )

    fe_items = [
        "Encode categorical variables (one-hot) and scale numeric variables before modeling.",
        "Impute remaining missing values (median for numeric, mode for categorical).",
    ]
    if corr_rows:
        fe_items.append(
            f"Consider interaction/ratio features from correlated pairs (e.g. {corr_rows[0][0]} x {corr_rows[0][1]})."
        )
    if profile.get("date_columns"):
        fe_items.append("Expand date columns into year/month/weekday components for seasonality.")

    return [
        _section(
            "Dataset Summary",
            [
                _kv(
                    [
                        ("Rows", f"{s.get('rows', 0):,}"),
                        ("Columns", s.get("columns", 0)),
                        ("Numeric columns", s.get("numeric_columns", 0)),
                        ("Memory", f"{int(s.get('memory_bytes', 0)) / 1_048_576:.2f} MB"),
                        ("Quality", f"{q.get('grade', 'n/a')} ({q.get('score', 0)}/100)"),
                    ]
                )
            ],
        ),
        _section("Cleaning Summary", cleaning_blocks),
        _section(
            "Missing Values",
            [
                _table(["Column", "Missing", "Missing %"], missing_rows)
                if missing_rows
                else _p("No missing values detected.")
            ],
        ),
        _section(
            "Duplicates",
            [
                _kv(
                    [
                        ("Duplicate rows", s.get("duplicate_rows", 0)),
                        ("Duplicate share", f"{s.get('duplicate_pct', 0)}%"),
                    ]
                )
            ],
        ),
        _section(
            "Outliers",
            [
                _table(["Column", "Outliers", "Outlier %"], outlier_rows)
                if outlier_rows
                else _p("No significant outliers detected (IQR rule).")
            ],
        ),
        _section(
            "Column Statistics",
            [
                _table(["Column", "Type", "Missing", "Unique", "Mean", "Std"], col_rows)
                if col_rows
                else _p("Column statistics unavailable.")
            ],
        ),
        _section(
            "Correlation Analysis",
            [
                _table(["Feature A", "Feature B", "Correlation"], corr_rows)
                if corr_rows
                else _p("Not enough numeric columns for correlation analysis.")
            ],
        ),
        _section("EDA Summary", [_p(eda_summary)]),
        _section("Feature Engineering Summary", [_list(fe_items)]),
    ]


# --- Model report ------------------------------------------------------------
def _build_model(ctx: dict) -> list[dict]:
    run: ModelRun | None = ctx["latest_run"]
    if run is None:
        return [
            _section(
                "Model Report",
                [
                    _p(
                        "No model has been trained on this dataset yet. Open Model Studio and run "
                        "'Predict Best Model' to generate this report."
                    )
                ],
            )
        ]
    result = run.result or {}
    best = result.get("best", {})
    tuning = result.get("tuning", {}) or {}
    advisor = result.get("advisor", {}) or {}

    lb_rows = []
    cv_rows = []
    for e in result.get("leaderboard", [])[:12]:
        metrics = e.get("metrics", {}) or {}
        primary = result.get("primary_metric", "")
        lb_rows.append(
            [
                e.get("rank", "—"),
                e.get("label", e.get("key", "")),
                f"{metrics.get(primary, float('nan')):.4f}" if primary in metrics else "failed",
                "yes" if e.get("tuned") else "no",
                f"{e.get('train_seconds', 0)}s",
            ]
        )
        if e.get("cv_mean") is not None:
            cv_rows.append(
                [
                    e.get("label", ""),
                    f"{e.get('cv_mean', 0):.4f}",
                    f"± {e.get('cv_std', 0):.4f}",
                ]
            )

    metric_rows = [[k, f"{v:.4f}" if isinstance(v, (int, float)) else v] for k, v in (best.get("metrics") or {}).items()]
    fi_rows = [
        [f.get("feature", ""), f"{float(f.get('importance', 0)):.4f}"]
        for f in (best.get("feature_importance") or [])[:12]
    ]

    tuning_blocks: list[dict] = []
    if tuning.get("enabled"):
        tuning_blocks.append(
            _kv(
                [
                    ("Search method", tuning.get("method", "—")),
                    ("Trials per model", tuning.get("n_trials", "—")),
                    ("Score before tuning", tuning.get("pre_score", "—")),
                    ("Score after tuning", tuning.get("post_score", "—")),
                    ("Improvement", tuning.get("delta", "—")),
                ]
            )
        )
        if best.get("best_params"):
            tuning_blocks.append(
                _table(
                    ["Hyperparameter", "Best value"],
                    [[k.split("__")[-1], v] for k, v in best["best_params"].items()],
                )
            )
    else:
        tuning_blocks.append(_p("Hyperparameter tuning was not enabled for this run."))

    diag_items: list[str] = []
    if best.get("confusion_matrix"):
        diag_items.append("Confusion matrix (included below)")
    if (best.get("roc_curve") or {}).get("auc") is not None:
        diag_items.append(f"ROC curve — AUC {best['roc_curve']['auc']}")
    if best.get("residuals"):
        diag_items.append(
            f"Residuals — mean {best['residuals'].get('mean')}, std {best['residuals'].get('std')}"
        )
    if best.get("learning_curve"):
        diag_items.append("Learning curve (train vs validation score by sample size)")
    if best.get("shap"):
        diag_items.append(f"SHAP importance ({best['shap'].get('method', 'shap')})")
    overfit = best.get("overfit") or {}
    if overfit:
        diag_items.append(
            f"Overfitting check — verdict: {overfit.get('verdict', '?')} (gap {overfit.get('gap', 0)})"
        )

    cm_block: dict | None = None
    cm = best.get("confusion_matrix")
    if cm and cm.get("matrix"):
        labels = [str(l) for l in cm.get("labels", [])]
        cm_block = _table(
            ["actual \\ predicted", *labels],
            [[labels[i], *row] for i, row in enumerate(cm["matrix"])],
        )

    sections = [
        _section(
            "Prediction Objective",
            [
                _kv(
                    [
                        ("Objective", f"Predict '{run.target}'" if run.target else "Segment the dataset"),
                        ("Task type", run.task),
                        ("Rows used", f"{result.get('n_rows_used', 0):,}"),
                        ("Test split", f"{int(float(result.get('test_size', 0)) * 100)}%"),
                    ]
                )
            ],
        ),
        _section(
            "Selected Features (X) and Target (Y)",
            [
                _kv([("Target (Y)", run.target or "—"), ("Feature count (X)", result.get("n_features", 0))]),
                _p("Features: " + ", ".join(result.get("features", [])[:40])),
            ],
        ),
        _section(
            "Algorithms Tested",
            [_table(["Rank", "Model", result.get("primary_metric", "score"), "Tuned", "Train time"], lb_rows)],
        ),
        _section("Hyperparameter Tuning Summary", tuning_blocks),
        _section(
            "Cross-Validation Results",
            [
                _table(["Model", "CV mean", "CV std"], cv_rows)
                if cv_rows
                else _p("Cross-validation details not recorded for this run.")
            ],
        ),
        _section(
            "Best Model",
            [
                _kv(
                    [
                        ("Model", run.best_model_label),
                        ("Primary metric", run.primary_metric),
                        ("Score", f"{run.primary_score:.4f}"),
                    ]
                ),
                _table(["Metric", "Value"], metric_rows) if metric_rows else _p("—"),
            ],
        ),
        _section(
            "Feature Importance",
            [_table(["Feature", "Importance"], fi_rows) if fi_rows else _p("Not available for this model.")],
        ),
        _section(
            "Diagnostics",
            ([_list(diag_items)] if diag_items else [_p("No diagnostics recorded.")])
            + ([cm_block] if cm_block else []),
        ),
    ]

    if advisor:
        sections.append(
            _section(
                "AI Model Advisor",
                [
                    _callout(advisor.get("business_summary") or advisor.get("summary") or ""),
                    _p(advisor.get("winner_reason", "")),
                    _p((advisor.get("overfitting") or {}).get("message", "")),
                    _p(advisor.get("tuning", "")),
                    _list(advisor.get("suggestions") or []),
                ],
            )
        )
    return sections


# --- AI insight --------------------------------------------------------------
def _build_ai_insight(ctx: dict) -> list[dict]:
    profile, insights = ctx["profile"], ctx["insights"]
    s = profile.get("dataset_summary", {})

    patterns, anomalies, opportunities, risks = [], [], [], []
    for i in insights:
        text = f"{i.get('title', '')}: {i.get('what_we_found', '')}"
        kind = str(i.get("type", i.get("category", ""))).lower()
        if "anomal" in kind or "outlier" in kind:
            anomalies.append(text)
        elif "risk" in kind:
            risks.append(text)
        elif "opportunit" in kind or "growth" in kind:
            opportunities.append(text)
        else:
            patterns.append(text)
    opportunities.extend(
        i.get("business_impact", "") for i in insights[:3] if i.get("business_impact")
    )
    risks.extend(_derive_risks(profile, []))

    trend_items: list[str] = []
    for pair in profile.get("correlation", {}).get("top_pairs", [])[:4]:
        direction = "rises with" if float(pair.get("corr", 0)) > 0 else "falls as"
        trend_items.append(
            f"{pair.get('a', '')} {direction} {pair.get('b', '')} (r = {pair.get('corr', 0)})."
        )
    if profile.get("date_columns"):
        trend_items.append(
            f"Time dimension available ({', '.join(d.get('name', '') for d in profile['date_columns'][:2] if isinstance(d, dict)) or 'date column'}) — trend analysis over time is possible."
        )

    recommendations = [i.get("recommendation", "") for i in insights if i.get("recommendation")][:6]

    return [
        _section(
            "Overview",
            [
                _p(
                    f"Automated AI analysis of {s.get('rows', 0):,} records surfaced "
                    f"{len(insights)} noteworthy findings, grouped below into patterns, anomalies, "
                    "opportunities and risks."
                )
            ],
        ),
        _section("Patterns", [_list(patterns[:6]) if patterns else _p("No dominant patterns detected.")]),
        _section("Anomalies", [_list(anomalies[:6]) if anomalies else _p("No significant anomalies detected.")]),
        _section(
            "Business Opportunities",
            [_list([o for o in opportunities if o][:6]) if any(opportunities) else _p("—")],
        ),
        _section("Risks", [_list(risks[:6]) if risks else _p("No material risks detected.")]),
        _section(
            "Customer & Segment Insights",
            [
                _list(
                    [
                        f"{c.get('column', '')}: top value '{(c.get('top_values') or [{}])[0].get('value', '—')}' covers {(c.get('top_values') or [{}])[0].get('pct', 0)}% of records"
                        for c in profile.get("categorical_analysis", [])[:5]
                    ]
                )
                if profile.get("categorical_analysis")
                else _p("No categorical segments available.")
            ],
        ),
        _section("Trend Analysis", [_list(trend_items) if trend_items else _p("No numeric trends detected.")]),
        _section(
            "Recommendations",
            [_list(recommendations) if recommendations else _p("Run the insight engine for recommendations.")],
        ),
        _section(
            "Future Improvements",
            [
                _list(
                    [
                        "Enrich the dataset with external attributes to deepen the patterns above.",
                        "Track these findings over time by re-running this report on fresh data.",
                        "Convert the highest-confidence findings into monitored KPIs.",
                        "Use Model Studio to turn descriptive findings into predictions.",
                    ]
                )
            ],
        ),
    ]
