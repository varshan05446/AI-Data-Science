"""Additional model tasks: unsupervised clustering and a time-series baseline.

These share the AutoML feel (a ranked leaderboard + a "best" block with a plot)
so the Model Studio UI can render them through the same result contract. Both
are deterministic, row-capped and JSON-safe.
"""
from __future__ import annotations

import time
from typing import Any

import numpy as np
import pandas as pd

from app.services.data.profiling import _py, _semantic_type
from app.services.ml.automl import (
    AutoMLError,
    _ROW_CAP,
    _RANDOM_STATE,
    _build_preprocessor,
    _select_features,
)
from app.services.ml.registry import available_models, get_model

_DEFAULT_CLUSTERERS = ["kmeans", "dbscan", "agglomerative"]
_PLOT_CAP = 1500


def train_clustering(
    df: pd.DataFrame,
    *,
    model_keys: list[str] | None = None,
    n_clusters: int | None = None,
) -> dict[str, Any]:
    """Cluster the numeric/categorical feature space and rank by silhouette."""
    from sklearn.decomposition import PCA
    from sklearn.metrics import davies_bouldin_score, silhouette_score

    data = df.copy()
    if len(data) < 20:
        raise AutoMLError("Need at least 20 rows to cluster.")
    if len(data) > _ROW_CAP:
        data = data.sample(_ROW_CAP, random_state=_RANDOM_STATE).reset_index(drop=True)

    numeric, categorical = _select_features(data, target="")
    features = numeric + categorical
    if not features:
        raise AutoMLError("No usable numeric/categorical columns found for clustering.")

    pre = _build_preprocessor(numeric, categorical)
    X = pre.fit_transform(data[features])
    X = np.asarray(X, dtype=float)

    available = {m.key for m in available_models("clustering")}
    keys = [k for k in (model_keys or _DEFAULT_CLUSTERERS) if k in available]
    if not keys:
        raise AutoMLError("No clustering models are available.")

    leaderboard: list[dict[str, Any]] = []
    label_map: dict[str, np.ndarray] = {}
    for key in keys:
        spec = get_model(key)
        if spec is None:
            continue
        estimator = spec.builder()
        if key == "kmeans" and n_clusters:
            try:
                estimator.set_params(n_clusters=int(np.clip(n_clusters, 2, 20)))
            except (ValueError, KeyError):
                pass
        started = time.perf_counter()
        try:
            labels = estimator.fit_predict(X)
        except Exception as exc:  # noqa: BLE001
            leaderboard.append({"key": key, "label": spec.label, "error": str(exc), "metrics": {}})
            continue
        elapsed = round(time.perf_counter() - started, 3)
        n_found = int(len(set(labels)) - (1 if -1 in labels else 0))
        metrics: dict[str, float] = {"n_clusters": float(n_found)}
        if 1 < len(set(labels)) < len(labels):
            try:
                metrics["silhouette"] = round(float(silhouette_score(X, labels)), 4)
            except Exception:  # noqa: BLE001
                pass
            try:
                # Davies-Bouldin: lower is better (0 = ideal separation).
                metrics["davies_bouldin"] = round(float(davies_bouldin_score(X, labels)), 4)
            except Exception:  # noqa: BLE001
                pass
        leaderboard.append(
            {
                "key": key,
                "label": spec.label,
                "metrics": metrics,
                "train_seconds": elapsed,
            }
        )
        label_map[key] = np.asarray(labels)

    scored = [e for e in leaderboard if "silhouette" in e.get("metrics", {})]
    if not scored:
        raise AutoMLError("Clustering did not produce separable groups on this data.")
    scored.sort(key=lambda e: e["metrics"]["silhouette"], reverse=True)
    for i, entry in enumerate(scored, start=1):
        entry["rank"] = i
    failed = [e for e in leaderboard if "silhouette" not in e.get("metrics", {})]

    best = scored[0]
    best_labels = label_map[best["key"]]

    # 2-D projection for a coloured scatter of the winning clustering.
    try:
        coords = PCA(n_components=2, random_state=_RANDOM_STATE).fit_transform(X)
    except Exception:  # noqa: BLE001
        coords = np.column_stack([X[:, 0], X[:, 1] if X.shape[1] > 1 else X[:, 0]])
    idx = _even_indices(len(coords), _PLOT_CAP)
    cluster_plot = {
        "x": [round(float(coords[i, 0]), 4) for i in idx],
        "y": [round(float(coords[i, 1]), 4) for i in idx],
        "cluster": [str(int(best_labels[i])) for i in idx],
    }

    return {
        "task": "clustering",
        "target": "",
        "primary_metric": "silhouette",
        "features": features,
        "n_rows_used": int(len(data)),
        "n_features": len(features),
        "test_size": 0.0,
        "leaderboard": scored + failed,
        "tuning": {"enabled": False},
        "best": {
            "key": best["key"],
            "label": best["label"],
            "metrics": best["metrics"],
            "feature_importance": [],
            "n_clusters": int(best["metrics"].get("n_clusters", 0)),
            "cluster_plot": cluster_plot,
        },
    }


def train_timeseries(
    df: pd.DataFrame,
    target: str,
    *,
    time_col: str | None = None,
) -> dict[str, Any]:
    """Seasonal-naive vs linear-trend baseline on a time-ordered numeric target."""
    from sklearn.linear_model import LinearRegression
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

    if target not in df.columns:
        raise AutoMLError(f"Target column '{target}' not found.")
    time_col = time_col or _detect_time_column(df)
    data = df[[c for c in {target, time_col} if c and c in df.columns]].dropna()
    if time_col and time_col in data.columns:
        data = data.sort_values(time_col)
    data = data.reset_index(drop=True)

    y = pd.to_numeric(data[target], errors="coerce").dropna()
    if len(y) < 30:
        raise AutoMLError("Need at least 30 ordered points for a time-series baseline.")
    y = y.reset_index(drop=True)

    split = int(len(y) * 0.8)
    train, test = y.iloc[:split], y.iloc[split:]
    t_train = np.arange(len(train)).reshape(-1, 1)
    t_test = np.arange(len(train), len(y)).reshape(-1, 1)

    # Seasonal-naive: repeat the last observed value (period-1 baseline).
    naive_pred = np.full(len(test), float(train.iloc[-1]))
    # Linear trend on the time index.
    lin = LinearRegression().fit(t_train, train.to_numpy())
    trend_pred = lin.predict(t_test)

    def metrics(pred: np.ndarray) -> dict[str, float]:
        out = {
            "r2": round(float(r2_score(test, pred)), 4),
            "rmse": round(float(np.sqrt(mean_squared_error(test, pred))), 4),
            "mae": round(float(mean_absolute_error(test, pred)), 4),
        }
        # MAPE only when actuals are safely away from zero (avoids blow-ups).
        actual = test.to_numpy(dtype=float)
        nonzero = np.abs(actual) > 1e-9
        if nonzero.sum() >= max(5, int(0.5 * len(actual))):
            mape = float(
                np.mean(np.abs((actual[nonzero] - np.asarray(pred)[nonzero]) / actual[nonzero]))
            )
            out["mape"] = round(mape * 100.0, 2)
        return out

    leaderboard = [
        {"key": "seasonal_naive", "label": "Seasonal Naive", "metrics": metrics(naive_pred), "train_seconds": 0.0},
        {"key": "linear_trend", "label": "Linear Trend", "metrics": metrics(trend_pred), "train_seconds": 0.0},
    ]
    leaderboard.sort(key=lambda e: e["metrics"]["r2"], reverse=True)
    for i, entry in enumerate(leaderboard, start=1):
        entry["rank"] = i

    best = leaderboard[0]
    best_pred = naive_pred if best["key"] == "seasonal_naive" else trend_pred
    forecast = {
        "index": list(range(len(y))),
        "actual": [round(float(v), 4) for v in y.to_numpy()],
        "predicted_index": list(range(split, len(y))),
        "predicted": [round(float(v), 4) for v in best_pred],
    }

    return {
        "task": "timeseries",
        "target": target,
        "primary_metric": "r2",
        "features": [c for c in [time_col] if c],
        "n_rows_used": int(len(y)),
        "n_features": 1,
        "test_size": 0.2,
        "leaderboard": leaderboard,
        "tuning": {"enabled": False},
        "best": {
            "key": best["key"],
            "label": best["label"],
            "metrics": best["metrics"],
            "feature_importance": [],
            "forecast": forecast,
        },
    }


def _detect_time_column(df: pd.DataFrame) -> str | None:
    for col in df.columns:
        if _semantic_type(df[col]) == "datetime":
            return col
    return None


def _even_indices(n: int, cap: int) -> list[int]:
    if n <= cap:
        return list(range(n))
    return list(np.linspace(0, n - 1, cap).astype(int))
