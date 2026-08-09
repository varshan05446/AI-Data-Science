"""Signal discovery for the Model Studio.

Runs a fast version of the AutoML engine across every viable target column and
reports the honest, hold-out / cross-validated ceiling each target can reach.
It also flags *derived-column leaks*: targets that are near-perfectly
recoverable as a deterministic function of other columns (e.g.
``unit_price ≈ revenue / units``) but are **not** caught by the engine's linear
leakage detector (|corr| >= 0.995). Surfacing these prevents a user from
celebrating a tautology as a genuine predictive insight.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.services.data.profiling import _semantic_type
from app.services.ml.automl import AutoMLError, train_and_evaluate

_MAX_TARGETS = 12  # cap so the synchronous endpoint returns in seconds
_ROW_CAP = 2000  # cheap single-model fit per target stays well under the engine cap
# Above these, a single feature, an arithmetic pair or a shallow tree "explains"
# the target well enough that the accuracy is almost certainly a tautology.
_LEAK_CORR = 0.9
_LEAK_PURITY = 0.97
_LEAK_TREE_R2 = 0.95
_MAX_PAIR_FEATURES = 8  # cap the O(n^2) ratio/product pair scan


def _viable_targets(df: pd.DataFrame, max_targets: int = _MAX_TARGETS) -> list[str]:
    """Columns that are reasonable prediction targets.

    Continuous numerics stay viable even at full cardinality (they are
    legitimate regression targets); only high-cardinality *categorical* columns
    are treated as identifiers and excluded (mirrors objectives.py).
    """
    n = len(df)
    viable: list[str] = []
    for col in df.columns:
        series = df[col].dropna()
        if series.empty:
            continue
        sem = _semantic_type(series)
        nunique = int(series.nunique())
        if sem in ("text", "datetime") or nunique <= 1:
            continue
        if float(series.isna().mean()) > 0.4:
            continue
        # Probable identifier: near-unique categorical values are pure noise.
        if sem == "categorical" and nunique >= 0.95 * n and nunique > 20:
            continue
        viable.append(col)
    return viable[: _MAX_TARGETS]


def _infer_task(df: pd.DataFrame, target: str) -> str:
    """Mirror automl.infer_task using raw series stats only."""
    series = df[target].dropna()
    sem = _semantic_type(series)
    nunique = int(series.nunique())
    if sem in ("categorical", "boolean", "text"):
        return "classification"
    if nunique <= 2:
        return "classification"
    if nunique <= 20 and nunique / len(series) < 0.05:
        return "classification"
    return "regression"


def _corr(a: pd.Series, b: pd.Series) -> float:
    """NaN-safe Pearson correlation between two numeric series."""
    try:
        pair = pd.concat([pd.to_numeric(a, errors="coerce"), pd.to_numeric(b, errors="coerce")], axis=1).dropna()
        if len(pair) < 10:
            return float("nan")
        c = float(pair.iloc[:, 0].corr(pair.iloc[:, 1]))
        return c if pd.notna(c) else float("nan")
    except Exception:  # noqa: BLE001 - best-effort
        return float("nan")


def _derived_pair_leak(
    data: pd.DataFrame, target: str, numeric_features: list[str]
) -> str | None:
    """Detect targets that are a *ratio or product* of two other columns.

    This is the classic derived-column tautology the linear leakage detector
    misses (e.g. ``unit_price ≈ revenue / units`` or
    ``revenue ≈ units * unit_price``): the target correlates near-perfectly with
    ``a / b`` or ``a * b`` even when neither column correlates with it directly.
    Returns a driver label like ``"revenue / units"`` or ``"units × unit_price"``.
    """
    cols = numeric_features[: _MAX_PAIR_FEATURES]
    y = data[target]
    best: tuple[float, str] = (0.0, "")
    with np.errstate(divide="ignore", invalid="ignore"):
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                a, b = data[cols[i]], data[cols[j]]
                for label, expr in (
                    (f"{cols[i]} / {cols[j]}", a / b),
                    (f"{cols[i]} × {cols[j]}", a * b),
                ):
                    c = abs(_corr(expr, y))
                    if c > best[0]:
                        best = (c, label)
                    if c >= _LEAK_CORR:
                        return label
    # Strong-but-not-conclusive pair (shown as a hint, not a hard leak).
    return best[1] if best[0] >= 0.8 else None


def _derived_leak(
    data: pd.DataFrame, target: str, task: str, features: list[str]
) -> tuple[bool, str | None]:
    """Detect targets that are almost a deterministic function of other columns.

    Three signals, all independent of the engine's linear leakage detector:

    * Regression: a single feature with |correlation| >= ``_LEAK_CORR``, an
      arithmetic pair (ratio/product) with |correlation| >= ``_LEAK_CORR``, or
      a shallow decision tree whose in-sample R2 >= ``_LEAK_TREE_R2``.
    * Classification: a single categorical feature whose classes map to a
      single outcome with purity >= ``_LEAK_PURITY``.

    Returns ``(leaky, driver)`` where ``driver`` names the feature(s) that make
    the target trivially recoverable (e.g. ``"revenue / units"``).
    """
    y = data[target]

    if task == "regression":
        y_num = pd.to_numeric(y, errors="coerce")
        best_driver: tuple[float, str] = (0.0, "")
        numeric_features: list[str] = []
        for col in features:
            if _semantic_type(data[col]) == "numeric":
                numeric_features.append(col)
            c = _corr(data[col], y_num)
            if pd.notna(c) and abs(c) > best_driver[0]:
                best_driver = (abs(c), col)
            if pd.notna(c) and abs(c) >= _LEAK_CORR:
                return True, col
        pair_driver = _derived_pair_leak(data, target, numeric_features)
        if pair_driver and _corr_pair_ge(data, target, numeric_features, pair_driver):
            return True, pair_driver
        # Shallow tree: catches nonlinear/arithmetic relations the corr checks
        # miss (e.g. ratios over a subset of rows with outliers).
        try:
            from sklearn.tree import DecisionTreeRegressor

            X = data[features].apply(pd.to_numeric, errors="coerce").fillna(0.0)
            yv = y_num.fillna(0.0).astype(float)
            if len(X) > 20 and X.shape[1] >= 1:
                tree = DecisionTreeRegressor(max_depth=6, random_state=42).fit(X, yv)
                if tree.score(X, yv) >= _LEAK_TREE_R2:
                    imps = tree.feature_importances_
                    top = [
                        features[i] for i in np.argsort(imps)[::-1] if imps[i] > 0.01
                    ][:2]
                    return True, ", ".join(top) if top else None
        except Exception:  # noqa: BLE001 - best-effort
            pass
        if best_driver[1] and best_driver[0] >= 0.8:
            # Strong (but not conclusive) single-column relationship.
            return False, best_driver[1]
        return False, None

    # Classification
    y_str = y.astype(str)
    for col in features:
        series = data[col]
        sem = _semantic_type(series)
        if sem not in ("categorical", "boolean"):
            continue
        try:
            grp = pd.crosstab(series.astype(str), y_str)
            total = float(grp.values.sum())
            if grp.empty or grp.shape[0] < 2 or total == 0:
                continue
            purity = float(grp.max(axis=1).sum()) / total
        except Exception:  # noqa: BLE001 - best-effort
            continue
        if purity >= _LEAK_PURITY:
            return True, col
    return False, None


def _corr_pair_ge(
    data: pd.DataFrame, target: str, numeric_features: list[str], driver: str
) -> bool:
    """Confirm a pair driver (e.g. ``"a / b"``) is a genuine >= 0.9 tautology.

    ``_derived_pair_leak`` returns the strongest pair even when it is only
    "strong but not conclusive" (>0.8); re-check the actual correlation so a
    hint never becomes a hard leak.
    """
    parts = driver.replace("×", "/").split("/")
    if len(parts) != 2:
        return False
    a, b = data[parts[0].strip()], data[parts[1].strip()]
    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = _corr(a / b, data[target])
        prod = _corr(a * b, data[target])
    return pd.notna(ratio) and abs(ratio) >= _LEAK_CORR or pd.notna(prod) and abs(prod) >= _LEAK_CORR


def scan_target_signals(
    df: pd.DataFrame, max_targets: int = _MAX_TARGETS, row_cap: int = _ROW_CAP
) -> list[dict[str, Any]]:
    """Rank every viable target by its achievable prediction score.

    Returns JSON-safe entries sorted best-first:
    ``{target, task, primary_metric, test_score, cv_mean, cv_std, best_model,
    n_features, leaky, driver, note, error?}``. ``leaky`` flags targets whose
    high score is a derived-column tautology rather than a business insight.
    """
    data = df.copy()
    if len(data) > row_cap:
        data = data.sample(row_cap, random_state=42).reset_index(drop=True)

    results: list[dict[str, Any]] = []
    for target in _viable_targets(data, max_targets=max_targets):
        task = _infer_task(data, target)
        # Cheapest model that still approximates the achievable ceiling:
        # GB for regression, a lighter RandomForest for classification. Keeps
        # the full scan to a minute even at the 2000-row cap.
        if task == "classification":
            model_key = "random_forest_clf"
            scan_params: dict[str, Any] = {"model__n_estimators": 40}
        else:
            model_key = "gradient_boosting_reg"
            scan_params = {"model__n_estimators": 60}
        entry: dict[str, Any] = {
            "target": target,
            "task": task,
            "primary_metric": "f1_weighted" if task == "classification" else "r2",
            "test_score": 0.0,
            "cv_mean": None,
            "cv_std": None,
            "best_model": "",
            "n_features": 0,
            "leaky": False,
            "driver": None,
            "note": None,
        }
        try:
            res = train_and_evaluate(
                data,
                target,
                task=task,  # type: ignore[arg-type]
                model_keys=[model_key],
                hyperparameters=scan_params,
                tune=False,
                cv_folds=3,
                minimal=True,  # skip SHAP / learning-curve / advisor per target
            )
        except AutoMLError as exc:
            entry["error"] = str(exc)
            results.append(entry)
            continue
        except Exception as exc:  # noqa: BLE001 - one bad target shouldn't kill the scan
            entry["error"] = f"Failed to evaluate: {exc}"
            results.append(entry)
            continue

        # CV stability lives on the leaderboard entry (``result["best"]`` is a
        # curated copy without it), so read the scan numbers from leaderboard[0].
        lb = res["leaderboard"][0] if res.get("leaderboard") else res.get("best", {})
        entry["test_score"] = round(float(lb["metrics"].get(entry["primary_metric"], 0.0)), 4)
        entry["cv_mean"] = round(float(lb["cv_mean"]), 4) if lb.get("cv_mean") is not None else None
        entry["cv_std"] = round(float(lb["cv_std"]), 4) if lb.get("cv_std") is not None else None
        entry["best_model"] = lb["label"]
        entry["n_features"] = int(res.get("n_features", 0))

        # Run the derived-leak check on every target: it is cheap and independent
        # of how strong the scan model is, so ratio/arithmetic tautologies like
        # ``unit_price ≈ revenue / units`` are flagged even when the scan model
        # scores them slightly under the ceiling.
        features = res.get("features") or []
        leaky, driver = _derived_leak(data, target, task, features)
        entry["leaky"] = bool(leaky)
        entry["driver"] = driver
        if leaky:
            entry["note"] = (
                f"High accuracy is driven by derived column(s) "
                f"{('(' + driver + ')') if driver else ''} — this looks like a "
                "tautology of the data itself, not a real business signal."
            )

        results.append(entry)

    results.sort(
        key=lambda e: (0 if e.get("error") else 1, e.get("test_score", 0.0)),
        reverse=True,
    )
    return results
