"""AI Model Advisor: turns a completed training run into plain-language advice.

Fully deterministic (no network) so it is fast, offline, and reproducible. It
reads the enriched ``result`` dict and explains *why* the winner won, judges
overfitting, and proposes concrete feature-removal / feature-engineering and
tuning next steps. Designed to be optionally augmented by an LLM later without
changing the response shape.
"""
from __future__ import annotations

from typing import Any

_METRIC_LABELS = {
    "accuracy": "accuracy",
    "f1_weighted": "weighted F1",
    "precision_weighted": "precision",
    "recall_weighted": "recall",
    "roc_auc": "ROC-AUC",
    "r2": "R\u00b2",
    "rmse": "RMSE",
    "mae": "MAE",
    "mse": "MSE",
    "mape": "MAPE",
    "silhouette": "silhouette score",
    "davies_bouldin": "Davies-Bouldin index",
}

_TUNING_METHODS = {
    "grid": "Exhaustive grid search",
    "optuna": "Bayesian (Optuna)",
    "random": "Randomized search",
}


def build_advice(result: dict[str, Any]) -> dict[str, Any]:
    """Return an advisor block: summary, winner_reason, overfitting, suggestions."""
    best = result.get("best", {})
    task = result.get("task", "")
    primary = result.get("primary_metric", "")
    score = float(best.get("metrics", {}).get(primary, 0.0))
    metric_label = _METRIC_LABELS.get(primary, primary)

    return {
        "summary": _summary(result, best, task, metric_label, score),
        "winner_reason": _winner_reason(result, best, primary, metric_label),
        "overfitting": _overfitting(best),
        "tuning": _tuning(result),
        "suggestions": _suggestions(result, best, task),
        "business_summary": _business_summary(result, best, task, metric_label, score),
    }


def _summary(result, best, task, metric_label, score) -> str:  # noqa: ANN001
    target = result.get("target", "the target")
    n_rows = result.get("n_rows_used", 0)
    n_feat = result.get("n_features", 0)
    return (
        f"{best.get('label', 'The winning model')} is the strongest {task} model for "
        f"predicting '{target}', scoring {score:.3f} {metric_label} on a held-out test "
        f"split of {n_rows:,} rows across {n_feat} features."
    )


def _business_summary(result, best, task, metric_label, score) -> str:  # noqa: ANN001
    """Multi-sentence narrative for business users: why the winner won, what
    optimization changed, how stable it is, and which features drive it."""
    label = best.get("label", "The winning model")
    target = result.get("target", "the target")
    parts: list[str] = []

    # Why this model suits the data.
    key = best.get("key", "")
    if any(t in key for t in ("forest", "tree", "boosting", "xgb", "lgbm", "catboost")):
        why = (
            "it captures non-linear relationships and mixed feature types "
            "without heavy manual preparation"
        )
    elif any(t in key for t in ("logistic", "linear", "ridge", "lasso", "elastic")):
        why = "the relationships in this data are largely linear and it stays simple and interpretable"
    elif "svm" in key or "svc" in key or "svr" in key:
        why = "it finds a clear separating boundary even in complex feature spaces"
    elif "neighbors" in key or "knn" in key:
        why = "similar records in this data tend to share the same outcome"
    else:
        why = "it fit this data's patterns better than every alternative tested"
    parts.append(
        f"{label} delivered the best results for predicting '{target}' because {why}, "
        f"reaching {score:.1%} {metric_label}." if score <= 1 and metric_label not in ("RMSE", "MAE")
        else f"{label} delivered the best results for predicting '{target}' because {why} "
        f"({metric_label}: {score:,.3f})."
    )

    # What optimization changed, in plain language.
    tuning = result.get("tuning") or {}
    best_params = best.get("best_params") or {}
    if tuning.get("enabled") and best.get("tuned") and best_params:
        changes = _describe_param_changes(best_params)
        delta = tuning.get("delta", 0.0)
        if changes:
            parts.append("During optimization " + "; ".join(changes[:3]) + ".")
        if delta > 0.001:
            parts.append(
                f"Automatic optimization lifted overall performance by {delta:+.3f}."
            )
    elif tuning.get("enabled"):
        parts.append(
            "Automatic optimization confirmed the default configuration was already strong."
        )

    # Stability from cross-validation.
    entry = next(
        (e for e in result.get("leaderboard", []) if e.get("key") == key and e.get("cv_mean") is not None),
        None,
    )
    if entry is not None:
        std = float(entry.get("cv_std") or 0.0)
        stability = "very stable" if std < 0.02 else "reasonably stable" if std < 0.06 else "somewhat variable"
        parts.append(
            f"Cross-validation shows the model is {stability} across different "
            f"slices of the data ({entry['cv_mean']:.3f} \u00b1 {std:.3f})."
        )

    # Leakage note.
    removed = (result.get("leakage") or {}).get("removed") or []
    if removed:
        names = ", ".join(r["feature"] for r in removed[:3])
        parts.append(
            f"{len(removed)} column(s) were excluded automatically ({names}) because "
            "they effectively contained the answer and would have inflated results."
        )

    # Top drivers.
    importance = best.get("feature_importance") or []
    if importance:
        top = [f["feature"] for f in importance[:3]]
        parts.append(f"The most influential factors are {', '.join(top)}.")

    return " ".join(parts)


_PARAM_LABELS = {
    "max_depth": "tree depth was limited to {v} to prevent overfitting",
    "n_estimators": "the ensemble size was set to {v} models",
    "learning_rate": "the learning rate was adjusted to {v} for steadier learning",
    "min_samples_leaf": "leaves now require at least {v} samples, smoothing predictions",
    "min_samples_split": "splits now require at least {v} samples, reducing noise-chasing",
    "subsample": "each round trains on {v:.0%} of rows to improve generalization",
    "colsample_bytree": "each tree sees {v:.0%} of features to reduce correlation",
    "C": "regularization strength was tuned to C={v}",
    "gamma": "the kernel reach was tuned to gamma={v}",
    "kernel": "the {v} kernel was selected",
    "n_neighbors": "predictions now consider the {v} most similar records",
    "alpha": "regularization was tuned to alpha={v}",
    "penalty": "{v} regularization was selected to keep the model lean",
    "solver": "the {v} solver was chosen for this data size",
    "criterion": "splits are now scored with the {v} criterion",
    "splitter": "the {v} split strategy was selected",
    "max_features": "each split considers {v} of the features to decorrelate trees",
    "metric": "similarity is now measured with the {v} distance",
    "weights": "neighbor votes are weighted by {v}",
    "iterations": "boosting ran for {v} rounds",
    "depth": "tree depth was tuned to {v}",
}


def _describe_param_changes(best_params: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for raw_key, value in best_params.items():
        name = raw_key.split("__")[-1]
        template = _PARAM_LABELS.get(name)
        if template is None:
            continue
        try:
            out.append(template.format(v=value))
        except (ValueError, TypeError):
            out.append(f"{name} was tuned to {value}")
    return out


def _winner_reason(result, best, primary, metric_label) -> str:  # noqa: ANN001
    leaderboard = [e for e in result.get("leaderboard", []) if e.get("metrics")]
    if len(leaderboard) < 2:
        return f"It was the only model that trained successfully on this data."
    top = leaderboard[0].get("metrics", {}).get(primary)
    runner = leaderboard[1]
    runner_score = runner.get("metrics", {}).get(primary)
    if top is None or runner_score is None:
        return "It ranked first on the primary metric across all candidates."
    margin = abs(top - runner_score)
    closeness = "comfortably" if margin >= 0.02 else "narrowly"
    return (
        f"It beat the next-best model ({runner.get('label', 'runner-up')}) {closeness} "
        f"on {metric_label} ({top:.3f} vs {runner_score:.3f})."
    )


def _overfitting(best) -> dict[str, Any]:  # noqa: ANN001
    gap = best.get("overfit")
    if not gap:
        return {"verdict": "unknown", "message": "Train-vs-test gap was not available."}
    verdict = gap.get("verdict", "unknown")
    delta = gap.get("gap", 0.0)
    messages = {
        "low": f"Healthy fit: the train-test gap is small ({delta:+.3f}); the model generalizes well.",
        "moderate": f"Some overfitting: a {delta:+.3f} train-test gap suggests mild memorization; consider regularization or more data.",
        "high": f"Strong overfitting: a large {delta:+.3f} train-test gap; reduce model complexity, add regularization, or gather more data.",
    }
    return {"verdict": verdict, "message": messages.get(verdict, "Fit quality is unclear.")}


def _tuning(result) -> str:  # noqa: ANN001
    tuning = result.get("tuning")
    if not tuning or not tuning.get("enabled"):
        return "Hyperparameter tuning was not run. Enable it to squeeze out extra performance."
    delta = tuning.get("delta", 0.0)
    method = _TUNING_METHODS.get(tuning.get("method", ""), "Hyperparameter")
    if delta > 0.001:
        return f"{method} tuning improved the primary metric by {delta:+.3f} over defaults."
    if delta < -0.001:
        return f"Tuning did not help here ({delta:+.3f}); the default hyperparameters were already strong."
    return "Tuning produced a negligible change; defaults were already near-optimal."


def _suggestions(result, best, task) -> list[str]:  # noqa: ANN001
    out: list[str] = []
    importance = best.get("feature_importance") or []

    # Feature removal: near-zero importance features add noise + training cost.
    weak = [f["feature"] for f in importance if abs(float(f.get("importance", 0))) < 1e-4]
    if weak:
        preview = ", ".join(weak[:4])
        more = "" if len(weak) <= 4 else f" (+{len(weak) - 4} more)"
        out.append(
            f"Consider dropping low-signal features ({preview}{more}); they add little and can hurt generalization."
        )

    # Feature engineering: leverage the top drivers.
    if importance:
        top = [f["feature"] for f in importance[:3]]
        out.append(
            f"Engineer interactions or ratios from the top drivers ({', '.join(top)}) to capture non-linear effects."
        )

    if task == "classification" and result.get("classes"):
        cm = best.get("confusion_matrix")
        if cm and _is_imbalanced(cm):
            out.append(
                "Classes look imbalanced; try class weighting, resampling (SMOTE), or threshold tuning to lift minority recall."
            )
    if task == "regression":
        out.append(
            "Inspect the residual distribution for skew or heteroscedasticity; a log-transform of the target can help."
        )

    if not out:
        out.append("The model looks solid. Enable tuning or add domain features to push it further.")
    return out


def _is_imbalanced(cm: dict[str, Any]) -> bool:
    matrix = cm.get("matrix") or []
    totals = [sum(row) for row in matrix]
    if not totals or min(totals) == 0:
        return len(totals) > 1
    return max(totals) / max(1, min(totals)) >= 3.0
