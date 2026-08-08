"""Agent orchestration.

A small, dependency-light pipeline that emulates a senior data science team:

    Profiler  -> reads the computed profile
    Analyst   -> detects noteworthy signals (quality, correlations, imbalance...)
    Explainer -> phrases each signal as what/why
    Recommender -> attaches a recommendation, business impact and confidence

The output is a list of :class:`Insight` following the product's explainability
contract. This runs fully offline; when a real LLM is configured it is used to
enrich chart explanations and power the conversational chat endpoint.

The structure intentionally mirrors a LangGraph state graph (nodes over a shared
state); it is kept as plain functions so the backend runs without extra
dependencies and can be lifted into LangGraph later without API changes.
"""
from __future__ import annotations

from typing import Any

import pandas as pd

from app.services.ai.base import ChatTurn, Insight, LLMProvider
from app.services.ai.analyst import try_answer
from app.services.ai.nlp import understand
from app.services.ai import product_kb

# --- Individual "agent" stages ------------------------------------------------


def _analyst_signals(profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect noteworthy signals from the profile (the Analyst node)."""
    signals: list[dict[str, Any]] = []
    quality = profile.get("quality", {})
    summary = profile.get("dataset_summary", {})

    # Data quality signal
    score = quality.get("score", 0)
    signals.append(
        {
            "kind": "quality",
            "score": score,
            "grade": quality.get("grade"),
            "components": quality.get("components", {}),
        }
    )

    # Missing data hotspots
    worst_missing = profile.get("missing_report", [])[:3]
    if worst_missing:
        signals.append({"kind": "missing", "columns": worst_missing})

    # Duplicates
    dup_pct = summary.get("duplicate_pct", 0)
    if dup_pct > 1:
        signals.append({"kind": "duplicates", "pct": dup_pct,
                        "rows": summary.get("duplicate_rows", 0)})

    # Strong correlations
    top_pairs = [p for p in profile.get("correlation", {}).get("top_pairs", [])
                 if abs(p.get("corr", 0)) >= 0.6]
    if top_pairs:
        signals.append({"kind": "correlation", "pairs": top_pairs[:3]})

    # Outlier-heavy numeric columns
    outlier_cols = [
        {"column": c["name"], "pct": c["stats"]["outlier_pct"]}
        for c in profile.get("columns", [])
        if c.get("stats") and c["stats"].get("outlier_pct", 0) >= 5
    ]
    if outlier_cols:
        signals.append({"kind": "outliers", "columns": outlier_cols[:3]})

    # Class imbalance on likely targets
    for tgt in profile.get("target_suggestions", []):
        col = next((c for c in profile.get("columns", []) if c["name"] == tgt["column"]), None)
        if col and col.get("top_values"):
            top = col["top_values"][0]
            if top["pct"] >= 80 and tgt["type"] == "classification":
                signals.append({"kind": "imbalance", "column": col["name"], "top": top})
                break
    return signals


def _to_insight(signal: dict[str, Any]) -> Insight | None:
    """Explainer + Recommender: turn a signal into a full Insight."""
    kind = signal["kind"]

    if kind == "quality":
        score = signal["score"]
        sev = "high" if score < 60 else "medium" if score < 80 else "info"
        weakest = min(signal["components"].items(), key=lambda kv: kv[1], default=("", 100))
        return Insight(
            title=f"Data quality is {signal['grade']} ({score}/100)",
            what_we_found=f"The dataset scored {score}/100, with '{weakest[0]}' as the "
            f"weakest dimension ({weakest[1]}/100).",
            why_it_happens="Quality reflects completeness, uniqueness, validity and "
            "consistency across all columns.",
            recommendation="Address the weakest dimension first - it yields the largest "
            "improvement per unit of effort."
            if score < 90
            else "Quality is strong; proceed to analysis with confidence.",
            business_impact="Higher quality directly increases the reliability of every "
            "downstream decision and model.",
            confidence=0.9,
            severity=sev,
            tags=["quality"],
        )

    if kind == "missing":
        cols = signal["columns"]
        worst = cols[0]
        return Insight(
            title=f"Missing values concentrated in '{worst['column']}'",
            what_we_found=f"'{worst['column']}' is {worst['missing_pct']}% empty"
            + (f" (plus {len(cols) - 1} more columns)" if len(cols) > 1 else "") + ".",
            why_it_happens="Missingness usually comes from optional fields, integration "
            "gaps or collection changes over time.",
            recommendation="Review whether these fields are optional; impute low-missing "
            "columns and consider dropping columns that are mostly empty.",
            business_impact="Unaddressed gaps bias aggregates and can silently skew KPIs.",
            confidence=0.8,
            severity="high" if worst["missing_pct"] > 40 else "medium",
            tags=["missing", "cleaning"],
        )

    if kind == "duplicates":
        return Insight(
            title=f"{signal['pct']}% duplicate rows detected",
            what_we_found=f"{signal['rows']} rows appear to be exact duplicates.",
            why_it_happens="Duplicates often result from repeated exports or joins that fan "
            "out rows.",
            recommendation="De-duplicate on the natural key before aggregating metrics.",
            business_impact="Duplicates inflate counts and totals, overstating performance.",
            confidence=0.85,
            severity="medium",
            tags=["duplicates", "cleaning"],
        )

    if kind == "correlation":
        pair = signal["pairs"][0]
        return Insight(
            title=f"'{pair['a']}' and '{pair['b']}' move together",
            what_we_found=f"They have a correlation of {pair['corr']}.",
            why_it_happens="A strong correlation suggests a shared driver or a direct "
            "relationship between the two measures.",
            recommendation="Use one as a predictor of the other, but avoid feeding both into "
            "a linear model (multicollinearity).",
            business_impact="Understanding this link helps forecast one metric from the other.",
            confidence=min(0.9, abs(pair["corr"])),
            severity="info",
            tags=["correlation"],
        )

    if kind == "outliers":
        col = signal["columns"][0]
        return Insight(
            title=f"Outliers present in '{col['column']}'",
            what_we_found=f"About {col['pct']}% of '{col['column']}' values sit far outside "
            "the typical range.",
            why_it_happens="Outliers can be genuine extremes, data-entry errors or unit "
            "inconsistencies.",
            recommendation="Verify a sample of the extremes before deciding to cap, transform "
            "or keep them.",
            business_impact="Outliers distort averages and can dominate model training.",
            confidence=0.7,
            severity="medium",
            tags=["outliers", "cleaning"],
        )

    if kind == "imbalance":
        return Insight(
            title=f"Class imbalance in '{signal['column']}'",
            what_we_found=f"'{signal['top']['value']}' represents {signal['top']['pct']}% of "
            f"the '{signal['column']}' column.",
            why_it_happens="Rare events (churn, fraud) are naturally infrequent.",
            recommendation="Use class weighting or resampling and evaluate with precision/recall "
            "rather than accuracy.",
            business_impact="Ignoring imbalance produces models that miss the rare cases that "
            "matter most.",
            confidence=0.75,
            severity="medium",
            tags=["modelling", "imbalance"],
        )
    return None


# --- Public pipeline API ------------------------------------------------------


def generate_insights(profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Run the Profiler->Analyst->Explainer->Recommender pipeline."""
    signals = _analyst_signals(profile)
    insights = [_to_insight(s) for s in signals]
    ordered = [i for i in insights if i is not None]
    severity_rank = {"high": 0, "medium": 1, "low": 2, "info": 3}
    ordered.sort(key=lambda i: (severity_rank.get(i.severity, 3), -i.confidence))
    return [i.as_dict() for i in ordered]


def generate_narrative(profile: dict[str, Any]) -> dict[str, Any]:
    """Synthesise an executive summary + next steps over the insights.

    Returns a plain dict with an ``executive_summary`` paragraph and an ordered
    ``next_steps`` list, phrased for a business audience. This does not describe
    raw statistics; it explains what they mean and what to do next.
    """
    summary = profile.get("dataset_summary", {})
    quality = profile.get("quality", {})
    insights = generate_insights(profile)
    rows = summary.get("rows", 0)
    cols = summary.get("columns", 0)
    grade = quality.get("grade", "?")
    score = quality.get("score", "?")

    headline = insights[0]["title"] if insights else "no critical issues stand out"
    targets = profile.get("target_suggestions", [])
    target_txt = (
        f" The most promising thing to predict is **{targets[0]['column']}** "
        f"({targets[0]['type']})."
        if targets
        else ""
    )

    executive_summary = (
        f"This dataset has **{rows:,} rows across {cols} columns** and earns a data "
        f"quality grade of **{grade} ({score}/100)**. The most important thing to "
        f"know right now is that **{headline.lower()}**.{target_txt} Overall the data "
        f"is {'ready for analysis' if isinstance(score, (int, float)) and score >= 80 else 'usable but would benefit from cleaning first'}."
    )

    # Ordered next steps, driven by the highest-severity findings.
    steps: list[str] = []
    tags_seen: set[str] = set()
    for ins in insights:
        for tag in ins.get("tags", []):
            if tag in ("cleaning", "missing", "duplicates", "outliers") and "clean" not in tags_seen:
                steps.append("Clean the flagged columns on the Data Cleaning tab (missing values, duplicates, outliers).")
                tags_seen.add("clean")
            if tag == "imbalance" and "imbalance" not in tags_seen:
                steps.append("Address class imbalance before modelling (class weights or resampling).")
                tags_seen.add("imbalance")
    steps.append("Explore relationships visually on the EDA tab (start with the strongest correlations).")
    if targets:
        steps.append(f"Run *Predict Best Model* targeting '{targets[0]['column']}' to benchmark algorithms.")
    steps.append("Ask the assistant follow-up questions to drill into any finding.")

    return {
        "executive_summary": executive_summary,
        "next_steps": steps[:5],
        "quality_grade": grade,
        "quality_score": score,
    }


def _profile_context(
    profile: dict[str, Any], dataset_id: str = "", extra_context: str = ""
) -> str:
    cols = [c["name"] for c in profile.get("columns", [])]
    summary = profile.get("dataset_summary", {})
    quality = profile.get("quality", {})
    isolation_fence = (
        f"SECURITY: You are scoped EXCLUSIVELY to dataset_id='{dataset_id}'. "
        "You must NEVER reference, compare, or leak information from any other "
        "dataset or project. If asked about other datasets, refuse politely. "
    ) if dataset_id else ""
    extra = f"\n{extra_context.strip()}" if extra_context.strip() else ""
    return (
        "You are an expert data science team in one assistant: a Senior Data "
        "Scientist, ML Engineer, Data Analyst, Statistician, Business Consultant, "
        "and Python/SQL expert. Always ground answers in THIS dataset, explain "
        "WHAT you found, WHY it happens, and HOW to act, and end with a confidence "
        f"level. Be concise and practical for a business audience. {isolation_fence}\n"
        f"Dataset: {summary.get('rows', '?')} rows, {summary.get('columns', '?')} columns. "
        f"Data quality score: {quality.get('score', '?')}/100.\n"
        f"Columns: {', '.join(cols)}{extra}\n\n"
        # The Data Scientist AI also knows the product UI, so it can answer
        # navigation questions in addition to analysing the data.
        + product_kb.ds_app_grounding()
    )


def answer_question(
    provider: LLMProvider,
    profile: dict[str, Any],
    history: list[dict[str, str]],
    question: str,
    dataset_id: str = "",
    extra_context: str = "",
) -> str:
    """Ground a chat question in the dataset profile and call the provider."""
    messages = [
        ChatTurn(
            role="system",
            content=_profile_context(profile, dataset_id, extra_context),
        )
    ]
    for turn in history[-8:]:
        role = turn.get("role", "user")
        if role in ("user", "assistant"):
            messages.append(ChatTurn(role=role, content=turn.get("content", "")))
    messages.append(ChatTurn(role="user", content=question))
    return provider.complete(messages)


def expert_answer(
    provider: LLMProvider,
    profile: dict[str, Any],
    df: pd.DataFrame | None,
    history: list[dict[str, str]],
    question: str,
    dataset_id: str = "",
    extra_context: str = "",
) -> tuple[str, dict[str, Any]]:
    """Answer like a senior data scientist, grounded in the real DataFrame.

    Strategy: parse the question (spell-correct + intent + conversation memory),
    try to compute a genuine answer from the data; if the data can't answer it,
    fall back to the configured LLM provider. Always returns ``(markdown,
    payload)``.

    ``history`` is scoped by the caller to THIS dataset only, so conversation
    memory never leaks across datasets.
    """
    u = understand(question, profile, history)
    payload: dict[str, Any] = {
        "understanding": u.as_dict(),
        "corrections": u.corrections,
    }

    # The Data Scientist AI also knows the UI: answer pure navigation questions
    # from the shared product knowledge base (no data access needed).
    if u.intent == "app_help":
        app = product_kb.answer_app_help(question)
        if app:
            payload["kind"] = "app_help"
            return app, payload

    if df is not None and not df.empty:
        computed = try_answer(df, u, profile)
        if computed is not None:
            content, extra = computed
            payload.update(extra)
            return content, payload

    # Open-ended question (or data couldn't answer) -> defer to the LLM.
    answer = answer_question(
        provider, profile, history, u.corrected, dataset_id, extra_context
    )
    return answer, payload


def explain_chart(provider: LLMProvider, chart: dict[str, Any]) -> str:
    """Turn a chart's deterministic summary into a short business explanation."""
    base = chart.get("summary", "")
    # The offline mock is already grounded in per-chart stats; keep its specific
    # finding instead of routing to a generic template.
    if getattr(provider, "name", "") == "mock":
        return base
    messages = [
        ChatTurn(
            role="system",
            content="You explain a single data visualisation to a business user in 1-2 "
            "sentences, then give one actionable takeaway.",
        ),
        ChatTurn(
            role="user",
            content=f"Chart: {chart.get('title')} ({chart.get('type')}). "
            f"Finding: {base}",
        ),
    ]
    try:
        return provider.complete(messages)
    except Exception:  # noqa: BLE001 - never fail EDA because of the AI layer
        return base
