"""Semi-supervised learning for the Model Studio.

Learns from a *partially labelled* target: rows with a non-null label are the
labelled set; rows with NaN / empty target are the unlabelled pool. Classic
self-training and graph-based label propagation use the unlabelled feature
space to improve a classifier fit on the labelled subset.

Shares the AutoML result contract (a ranked leaderboard + a "best" block with
plots) so the Model Studio UI renders it through the same result views as
supervised training. Deterministic, row-capped, JSON-safe, classification-only
(a clear error guides regression targets back to the Supervised category).
"""
from __future__ import annotations

import time
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder
from sklearn.semi_supervised import (
    LabelPropagation,
    LabelSpreading,
    SelfTrainingClassifier,
)

from app.services.ml import diagnostics
from app.services.ml.automl import (
    AutoMLError,
    _RANDOM_STATE,
    _build_preprocessor,
    _classification_metrics,
    _classification_report,
    _confidence_score,
    _permutation_importance,
    _select_features,
    infer_task,
    ProgressCallback,
)

_DEFAULT_ALGOS = ["self_training", "label_propagation", "label_spreading"]

# Base estimators usable inside self-training (all expose predict_proba).
_BASE_ESTIMATORS = {
    "logistic_regression": lambda: LogisticRegression(max_iter=1000),
    "random_forest_clf": lambda: RandomForestClassifier(
        n_estimators=100, random_state=_RANDOM_STATE
    ),
    "gradient_boosting_clf": lambda: GradientBoostingClassifier(
        random_state=_RANDOM_STATE
    ),
}

# Label propagation builds a k-NN graph, so keep the working set modest.
_SAMPLE_CAP = 3000
_CONF_BINS = 10
_PSEUDO_PLOT_CAP = 400


def available_semisupervised() -> list[dict[str, Any]]:
    """Algorithms advertised to the Model Studio config endpoint."""
    return [
        {"key": "self_training", "label": "Self-Training", "tags": ["pseudo-label", "iterative"]},
        {"key": "label_propagation", "label": "Label Propagation", "tags": ["graph", "label spread"]},
        {"key": "label_spreading", "label": "Label Spreading", "tags": ["graph", "label spread"]},
    ]


def _split_labeled_unlabeled(
    data: pd.DataFrame, target: str
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series]:
    """Split rows into labelled / unlabelled based on a missing target."""
    raw = data[target].astype("object")
    mask = raw.notna() & (raw.astype(str).str.strip() != "")
    return data[mask].copy(), data[~mask].copy(), data.loc[mask, target].astype(str)


def _pseudo_label_diagnostics(
    pipe: Any, X_unlab: pd.DataFrame, classes: list[str]
) -> dict[str, Any]:
    """Distribution + confidence histogram of the pseudo-labels on unlabelled rows."""
    out: dict[str, Any] = {"count": int(len(X_unlab))}
    if len(X_unlab) == 0:
        out["labels"] = []
        out["histogram"] = []
        return out
    try:
        preds = pipe.predict(X_unlab)
    except Exception:  # noqa: BLE001 - diagnostics are best-effort
        out["labels"] = []
        out["histogram"] = []
        return out
    # The pipeline was fit on integer-encoded labels; map back to class names.
    named = [classes[int(p)] for p in np.asarray(preds) if int(p) in range(len(classes))]
    series = pd.Series(named).value_counts()
    out["labels"] = [{"label": str(k), "count": int(v)} for k, v in series.items()]
    # Confidence histogram: max predicted probability per unlabelled row.
    try:
        proba = pipe.predict_proba(X_unlab.iloc[: _PSEUDO_PLOT_CAP])
        conf = np.max(np.asarray(proba), axis=1)
        hist, edges = np.histogram(conf, bins=_CONF_BINS, range=(0.5, 1.0))
        out["histogram"] = {
            "edges": [round(float(e), 4) for e in edges],
            "counts": [int(c) for c in hist],
        }
        out["mean_confidence"] = round(float(conf.mean()), 4)
    except Exception:  # noqa: BLE001
        out["histogram"] = []
    return out


def train_semisupervised(
    df: pd.DataFrame,
    target: str,
    *,
    model_keys: list[str] | None = None,
    test_size: float = 0.2,
    random_state: int | None = None,
    features: list[str] | None = None,
    threshold: float = 0.75,
    base_estimator: str = "logistic_regression",
    capture: dict[str, Any] | None = None,
    progress_cb: ProgressCallback | None = None,
) -> dict[str, Any]:
    """Train semi-supervised classifiers on a partially-labelled target.

    The honest evaluation holds out a stratified slice of the *labelled* rows
    only, fits each algorithm on the remaining labelled rows **plus every
    unlabelled row** (labels masked), and ranks on the held-out labels - so a
    high score reflects real use of the unlabelled data, not leakage.
    """
    def notify(frac: float, stage: str, message: str | None = None) -> None:
        if progress_cb is not None:
            try:
                progress_cb(frac, stage, message)
            except Exception:  # noqa: BLE001 - progress is best-effort
                pass

    data = df.copy()
    if target not in data.columns:
        raise AutoMLError(f"Target column '{target}' not found.")
    if len(data) > _SAMPLE_CAP:
        data = data.sample(_SAMPLE_CAP, random_state=_RANDOM_STATE).reset_index(drop=True)

    if infer_task(data, target) != "classification":
        raise AutoMLError(
            "Semi-supervised learning currently supports classification targets "
            "(a categorical or low-cardinality column). For regression use the "
            "Supervised Learning category."
        )

    labeled, unlabeled, y_labeled = _split_labeled_unlabeled(data, target)
    n_labeled, n_unlabeled = int(len(labeled)), int(len(unlabeled))
    if n_labeled < 20:
        raise AutoMLError("Need at least 20 labelled rows for semi-supervised training.")

    numeric, categorical = _select_features(data, target)
    if features:
        numeric = [c for c in numeric if c in features]
        categorical = [c for c in categorical if c in features]
    all_features = numeric + categorical
    if not all_features:
        raise AutoMLError("No usable feature columns found for this target.")

    rs = random_state if random_state is not None else _RANDOM_STATE
    notify(
        0.08,
        "preprocess",
        f"Found {n_labeled} labelled / {n_unlabeled} unlabelled rows.",
    )

    # Label encode the labelled target, then split the *labelled* rows only.
    encoder = LabelEncoder()
    y_enc = encoder.fit_transform(y_labeled)
    classes = [str(c) for c in encoder.classes_]

    stratify = y_enc if (len(np.unique(y_enc)) >= 2 and np.bincount(y_enc).min() >= 2) else None
    lab_idx = np.arange(n_labeled)
    train_idx, test_idx = train_test_split(
        lab_idx, test_size=test_size, random_state=rs, stratify=stratify
    )
    lab_train = labeled.iloc[train_idx]
    lab_test = labeled.iloc[test_idx]
    y_train = y_enc[train_idx]
    y_test = y_enc[test_idx]

    # Fit the feature preprocessor on labelled-train + all unlabelled rows so
    # category encodings are stable; held-out labelled rows are only transformed.
    fit_rows = pd.concat([lab_train[all_features], unlabeled[all_features]], axis=0)
    pre = _build_preprocessor(numeric, categorical, scaling="standard", encoding="onehot")
    pre.fit(fit_rows)
    n_unlab = int(len(unlabeled))

    notify(
        0.14,
        "split",
        f"Split labelled rows {len(train_idx):,} train / {len(test_idx):,} test.",
    )

    def build(key: str):
        if key == "self_training":
            base_fn = _BASE_ESTIMATORS.get(base_estimator)
            if base_fn is None:
                raise AutoMLError(f"Unknown base estimator '{base_estimator}'.")
            return SelfTrainingClassifier(base_fn(), threshold=float(threshold), max_iter=10)
        if key == "label_propagation":
            return LabelPropagation(kernel="knn", n_neighbors=7, max_iter=1000)
        if key == "label_spreading":
            return LabelSpreading(kernel="knn", n_neighbors=7, alpha=0.2, max_iter=1000)
        return None

    _LABELS = {
        "self_training": "Self-Training",
        "label_propagation": "Label Propagation",
        "label_spreading": "Label Spreading",
    }

    leaderboard: list[dict[str, Any]] = []
    fitted: dict[str, Any] = {}
    for key in (model_keys or _DEFAULT_ALGOS):
        model = build(key)
        if model is None:
            continue
        # Graph algorithms get a bounded working set (keep all labelled-train rows,
        # sample the unlabelled pool) so label propagation stays fast on wide data.
        fit_raw, fit_y = fit_rows, None
        if key in ("label_propagation", "label_spreading") and len(fit_rows) > _SAMPLE_CAP:
            keep_n = min(len(lab_train), _SAMPLE_CAP)
            if keep_n == len(lab_train):
                lab_sub, y_sub = lab_train, y_train
            else:
                idx = np.random.default_rng(rs).choice(len(lab_train), size=keep_n, replace=False)
                lab_sub, y_sub = lab_train.iloc[idx], y_train[idx]
            unlab_sub = unlabeled[all_features].sample(
                max(0, _SAMPLE_CAP - keep_n), random_state=rs
            )
            fit_raw = pd.concat([lab_sub[all_features], unlab_sub], axis=0)
            fit_y = np.concatenate([y_sub, np.full(len(unlab_sub), -1)])
        else:
            fit_y = np.concatenate([y_train, np.full(n_unlab, -1)])

        label = _LABELS[key]
        started = time.perf_counter()
        pipe = Pipeline([("pre", pre), ("model", model)])
        try:
            pipe.fit(fit_raw, fit_y)
        except Exception as exc:  # noqa: BLE001 - keep the leaderboard on failure
            leaderboard.append({"key": key, "label": label, "error": str(exc), "metrics": {}})
            continue
        elapsed = round(time.perf_counter() - started, 3)
        try:
            y_pred = pipe.predict(lab_test[all_features])
            proba = pipe.predict_proba(lab_test[all_features])
        except Exception as exc:  # noqa: BLE001
            leaderboard.append({"key": key, "label": label, "error": str(exc), "metrics": {}})
            continue
        metrics = _classification_metrics(y_test, y_pred, proba, classes)
        leaderboard.append(
            {
                "key": key,
                "label": label,
                "metrics": {k: round(v, 4) for k, v in metrics.items()},
                "train_seconds": elapsed,
            }
        )
        fitted[key] = (pipe, y_pred, proba)
        notify(
            0.2 + 0.6 * (len(leaderboard) / max(1, len(model_keys or _DEFAULT_ALGOS))),
            "train",
            f"{label} fitted ({len(train_idx):,} labelled + {n_unlab:,} unlabelled rows).",
        )

    scored = [e for e in leaderboard if e.get("metrics")]
    if not scored:
        raise AutoMLError("Semi-supervised training did not produce a usable model.")
    scored.sort(key=lambda e: e["metrics"].get("f1_weighted", float("-inf")), reverse=True)
    for i, entry in enumerate(scored, start=1):
        entry["rank"] = i
    failed = [e for e in leaderboard if not e.get("metrics")]

    best = scored[0]
    primary = "f1_weighted"
    best_pipe, best_y_pred, _ = fitted[best["key"]]

    importance = _permutation_importance(
        permutation_importance, best_pipe, lab_test[all_features], y_test, all_features
    )
    notify(
        0.86,
        "explain",
        f"Best: {best['label']} (F1={best['metrics'][primary]:.4f}). Explaining…",
    )

    y_train_pred = best_pipe.predict(lab_train[all_features])
    train_metrics = _classification_metrics(y_train, y_train_pred, None, classes)
    overfit = diagnostics.overfit_gap(
        train_metrics.get(primary, 0.0), best["metrics"].get(primary, 0.0)
    )

    result: dict[str, Any] = {
        "task": "semi_supervised",
        "target": target,
        "primary_metric": primary,
        "features": all_features,
        "n_rows_used": int(len(data)),
        "n_features": len(all_features),
        "test_size": test_size,
        "leaderboard": scored + failed,
        "tuning": {"enabled": False},
        "leakage": {"removed": []},
        "input_schema": [],
        "best": {
            "key": best["key"],
            "label": best["label"],
            "metrics": best["metrics"],
            "feature_importance": importance,
            "params": diagnostics.model_params(best_pipe),
            "labeled": n_labeled,
            "unlabeled": n_unlabeled,
            "threshold": round(float(threshold), 4),
            "base_estimator": base_estimator,
            "pseudo_labels": _pseudo_label_diagnostics(best_pipe, unlabeled[all_features], classes),
            "prediction_distribution": diagnostics.prediction_distribution(
                y_test, best_y_pred, "classification"
            ),
            "classification_report": _classification_report(y_test, best_y_pred, classes),
            "overfit": overfit,
            "confidence": _confidence_score(
                best["metrics"].get(primary, 0.0), "classification", overfit, None
            ),
        },
    }
    try:
        from app.services.ml.artifacts import build_input_schema

        result["input_schema"] = build_input_schema(lab_train[all_features], numeric, categorical)
    except Exception:  # noqa: BLE001 - schema is best-effort
        result["input_schema"] = []
    result["classes"] = classes
    if capture is not None:
        capture["pipeline"] = best_pipe
    notify(1.0, "done", "Semi-supervised training complete.")
    return result
