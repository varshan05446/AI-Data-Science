"""Rich diagnostics for a trained model, computed for the winning pipeline.

Everything here is best-effort and JSON-safe: each helper is wrapped so a
failure returns ``None``/empty rather than breaking the training response. Heavy
work (learning curve, SHAP) runs only for the single winning model and on capped
samples, keeping the one-click experience responsive.
"""
from __future__ import annotations

import os
from typing import Any

import numpy as np

from app.services.data.profiling import _py
from app.services.ml.registry import has_library

# shap transitively imports numba, whose CUDA support loads GPU DLLs that
# security policies (e.g. Windows App Control) may block with an ImportError.
# CPU-only numba is all we need, so skip the CUDA path entirely.
os.environ.setdefault("NUMBA_DISABLE_CUDA", "1")

_SHAP_SAMPLE = 200
_LEARNING_SIZES = (0.1, 0.325, 0.55, 0.775, 1.0)


def model_params(pipe: Any) -> dict[str, Any]:
    """Extract the estimator's own params (JSON-safe, scalars only)."""
    try:
        estimator = pipe.named_steps.get("model")
        params = estimator.get_params(deep=False) if estimator is not None else {}
    except Exception:  # noqa: BLE001
        return {}
    out: dict[str, Any] = {}
    for key, value in params.items():
        if isinstance(value, bool) or isinstance(value, (int, float, str)) or value is None:
            out[key] = value
        elif isinstance(value, (np.integer,)):
            out[key] = int(value)
        elif isinstance(value, (np.floating,)):
            out[key] = round(float(value), 6)
    return out


def roc_curve_points(pipe: Any, X_test: Any, y_test: Any, labels: list) -> dict[str, Any] | None:
    """Binary ROC curve points + AUC (down-sampled). ``None`` when unavailable."""
    if len(labels) != 2 or not hasattr(pipe, "predict_proba"):
        return None
    try:
        from sklearn.metrics import roc_auc_score, roc_curve

        proba = pipe.predict_proba(X_test)[:, 1]
        fpr, tpr, _ = roc_curve(y_test, proba, pos_label=labels[1])
        auc = float(roc_auc_score((np.asarray(y_test) == labels[1]).astype(int), proba))
    except Exception:  # noqa: BLE001
        return None
    # Down-sample the curve to at most ~60 points for a compact payload.
    idx = _even_indices(len(fpr), 60)
    return {
        "fpr": [round(float(fpr[i]), 4) for i in idx],
        "tpr": [round(float(tpr[i]), 4) for i in idx],
        "auc": round(auc, 4),
    }


def learning_curve_points(make_pipeline, task: str, X: Any, y: Any) -> dict[str, Any] | None:
    """Train/CV score vs training-set size for the winning model configuration."""
    try:
        from sklearn.model_selection import learning_curve

        scoring = "f1_weighted" if task == "classification" else "r2"
        sizes, train_scores, test_scores = learning_curve(
            make_pipeline(),
            X,
            y,
            train_sizes=list(_LEARNING_SIZES),
            cv=3,
            scoring=scoring,
            n_jobs=1,
            random_state=42,
        )
    except Exception:  # noqa: BLE001
        return None
    return {
        "sizes": [int(s) for s in sizes],
        "train": [round(float(v), 4) for v in train_scores.mean(axis=1)],
        "test": [round(float(v), 4) for v in test_scores.mean(axis=1)],
        "scoring": scoring,
    }


def prediction_distribution(y_test: Any, y_pred: Any, task: str) -> dict[str, Any] | None:
    """Actual-vs-predicted scatter sample (regression) or class support (clf)."""
    try:
        if task == "classification":
            actual = _counts(np.asarray(y_test))
            predicted = _counts(np.asarray(y_pred))
            labels = sorted(set(actual) | set(predicted), key=str)
            return {
                "kind": "class_support",
                "labels": [str(v) for v in labels],
                "actual": [int(actual.get(v, 0)) for v in labels],
                "predicted": [int(predicted.get(v, 0)) for v in labels],
            }
        actual = np.asarray(y_test, dtype=float)
        pred = np.asarray(y_pred, dtype=float)
        idx = _even_indices(len(actual), 400)
        return {
            "kind": "actual_vs_predicted",
            "actual": [round(float(actual[i]), 4) for i in idx],
            "predicted": [round(float(pred[i]), 4) for i in idx],
        }
    except Exception:  # noqa: BLE001
        return None


def residual_series(y_test: Any, y_pred: Any) -> list[float]:
    """Down-sampled residuals for a distribution plot (regression)."""
    try:
        resid = np.asarray(y_test, dtype=float) - np.asarray(y_pred, dtype=float)
        idx = _even_indices(len(resid), 400)
        return [round(float(resid[i]), 4) for i in idx]
    except Exception:  # noqa: BLE001
        return []


def shap_importance(pipe: Any, X_test: Any, features: list[str]) -> dict[str, Any] | None:
    """Mean |SHAP| feature importance when the ``shap`` library is installed."""
    if not has_library("shap"):
        return None
    try:
        import shap

        sample = X_test.iloc[:_SHAP_SAMPLE] if hasattr(X_test, "iloc") else X_test[:_SHAP_SAMPLE]
        pre = pipe.named_steps["prep"]
        model = pipe.named_steps["model"]
        transformed = pre.transform(sample)
        explainer = shap.Explainer(model, transformed)
        values = explainer(transformed)
        arr = np.asarray(values.values)
        # Collapse multi-class (samples, feats, classes) -> mean over classes.
        if arr.ndim == 3:
            arr = np.abs(arr).mean(axis=2)
        mean_abs = np.abs(arr).mean(axis=0)
        names = _feature_names(pre, features)
        pairs = sorted(
            zip(names, mean_abs), key=lambda p: float(p[1]), reverse=True
        )
        top = [
            {"feature": str(n), "importance": round(float(v), 4)}
            for n, v in pairs[:15]
        ]
    except Exception:  # noqa: BLE001
        return None
    return {"method": "shap", "values": top}


def overfit_gap(primary_train: float, primary_test: float) -> dict[str, Any]:
    """Train-vs-test gap on the primary metric with a plain-language verdict."""
    gap = round(float(primary_train) - float(primary_test), 4)
    if gap >= 0.15:
        verdict = "high"
    elif gap >= 0.06:
        verdict = "moderate"
    else:
        verdict = "low"
    return {
        "primary_train": round(float(primary_train), 4),
        "primary_test": round(float(primary_test), 4),
        "gap": gap,
        "verdict": verdict,
    }


# --- helpers -----------------------------------------------------------------
def _even_indices(n: int, cap: int) -> list[int]:
    if n <= cap:
        return list(range(n))
    return list(np.linspace(0, n - 1, cap).astype(int))


def _counts(arr: np.ndarray) -> dict[Any, int]:
    values, counts = np.unique(arr, return_counts=True)
    return {_py(v): int(c) for v, c in zip(values, counts)}


def _feature_names(pre: Any, fallback: list[str]) -> list[str]:
    try:
        return [str(n) for n in pre.get_feature_names_out()]
    except Exception:  # noqa: BLE001
        return fallback
