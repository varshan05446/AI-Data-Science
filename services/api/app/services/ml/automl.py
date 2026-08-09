"""AutoML engine: train and compare multiple models on a dataset.

The engine is deliberately deterministic and offline-friendly:

* Task (classification vs regression) is inferred from the target column.
* A scikit-learn ``ColumnTransformer`` handles imputation + scaling + one-hot
  encoding so heterogeneous columns train without manual prep.
* Every model in :mod:`app.services.ml.registry` for the inferred task is
  fitted through the same pipeline, then ranked on a hold-out split.
* Model-agnostic ``permutation_importance`` explains the winning model.

Runtime is bounded: rows are capped and a curated fast subset of models runs by
default, so a "Predict Best Model" click returns in seconds even on wide data.
"""
from __future__ import annotations

import time
from typing import Any, Callable

import numpy as np
import pandas as pd

from app.services.data.profiling import _py, _semantic_type
from app.services.ml import advisor, diagnostics
from app.services.ml.registry import Task, available_models, get_model
from app.services.ml.tuning import tune_model

_ROW_CAP = 5000
_MAX_ONEHOT_CARDINALITY = 40
_RANDOM_STATE = 42
_TUNE_TOP_N = 3  # how many leaderboard models to hyperparameter-tune when asked

# Fast, robust defaults so the leaderboard returns quickly. Heavy/slow
# estimators (SVM, KNN) are still available via explicit ``model_keys``.
_DEFAULT_CLF = [
    "logistic_regression",
    "decision_tree_clf",
    "random_forest_clf",
    "gradient_boosting_clf",
    "extra_trees_clf",
]
_DEFAULT_REG = [
    "linear_regression",
    "ridge",
    "decision_tree_reg",
    "random_forest_reg",
    "gradient_boosting_reg",
]


class AutoMLError(ValueError):
    """Raised for user-correctable problems (bad target, too few rows, ...)."""


def infer_task(df: pd.DataFrame, target: str) -> Task:
    """Infer classification vs regression from the target column."""
    if target not in df.columns:
        raise AutoMLError(f"Target column '{target}' not found.")
    series = df[target].dropna()
    if series.empty:
        raise AutoMLError(f"Target column '{target}' has no non-null values.")

    sem = _semantic_type(series)
    nunique = int(series.nunique())
    if sem in ("categorical", "boolean", "text"):
        return "classification"
    # Numeric target: few distinct values => treat as classification.
    if nunique <= 2:
        return "classification"
    if nunique <= 20 and nunique / len(series) < 0.05:
        return "classification"
    return "regression"


def _select_features(df: pd.DataFrame, target: str) -> tuple[list[str], list[str]]:
    """Choose usable feature columns, split into numeric vs categorical.

    Drops the target, probable identifiers, and free-text / very high-cardinality
    categoricals that would explode one-hot encoding.
    """
    numeric: list[str] = []
    categorical: list[str] = []
    n = len(df)
    for col in df.columns:
        if col == target:
            continue
        series = df[col]
        sem = _semantic_type(series)
        nunique = int(series.nunique(dropna=True))
        if nunique <= 1:
            continue  # constant column carries no signal
        if sem == "numeric":
            numeric.append(col)
        elif sem in ("categorical", "boolean"):
            if nunique <= _MAX_ONEHOT_CARDINALITY:
                categorical.append(col)
        # datetime / text / high-cardinality categoricals are skipped
    return numeric, categorical


def _build_preprocessor(
    numeric: list[str],
    categorical: list[str],
    scaling: str = "standard",
    encoding: str = "onehot",
):
    """ColumnTransformer honouring the Manual Workflow's scaling/encoding knobs."""
    from sklearn.compose import ColumnTransformer
    from sklearn.impute import SimpleImputer
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import (
        MinMaxScaler,
        OneHotEncoder,
        OrdinalEncoder,
        RobustScaler,
        StandardScaler,
    )

    scaler_map = {
        "standard": StandardScaler,
        "minmax": MinMaxScaler,
        "robust": RobustScaler,
    }
    scaler = scaler_map.get(scaling or "standard")

    transformers = []
    if numeric:
        num_steps = [("impute", SimpleImputer(strategy="median"))]
        if scaler is not None:
            num_steps.append(("scale", scaler()))
        transformers.append(("num", Pipeline(num_steps), numeric))

    if categorical:
        enc = encoding or "onehot"
        if enc == "ordinal":
            try:
                cat_enc = OrdinalEncoder(
                    handle_unknown="use_encoded_value", unknown_value=-1
                )
            except TypeError:  # pragma: no cover - older sklearn
                cat_enc = OrdinalEncoder()
        else:
            # ``sparse_output`` renamed from ``sparse`` in sklearn 1.2+.
            try:
                cat_enc = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
            except TypeError:  # pragma: no cover - older sklearn
                cat_enc = OneHotEncoder(handle_unknown="ignore", sparse=False)
        transformers.append(
            (
                "cat",
                Pipeline(
                    [
                        ("impute", SimpleImputer(strategy="most_frequent")),
                        ("encode", cat_enc),
                    ]
                ),
                categorical,
            )
        )
    return ColumnTransformer(transformers, remainder="drop")


def _classification_metrics(y_true, y_pred, y_proba, labels) -> dict[str, float]:
    from sklearn.metrics import (
        accuracy_score,
        f1_score,
        precision_score,
        recall_score,
        roc_auc_score,
    )

    metrics = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "f1_weighted": float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
        "precision_weighted": float(
            precision_score(y_true, y_pred, average="weighted", zero_division=0)
        ),
        "recall_weighted": float(
            recall_score(y_true, y_pred, average="weighted", zero_division=0)
        ),
    }
    if y_proba is not None:
        try:
            if len(labels) == 2:
                metrics["roc_auc"] = float(roc_auc_score(y_true, y_proba[:, 1]))
            elif len(labels) > 2:
                metrics["roc_auc"] = float(
                    roc_auc_score(
                        y_true, y_proba, multi_class="ovr", average="weighted", labels=labels
                    )
                )
        except (ValueError, IndexError):
            pass
    return metrics


def _classification_report(y_true, y_pred, labels) -> list[dict[str, Any]]:
    """Per-class precision/recall/F1/support for the winning model."""
    from sklearn.metrics import precision_recall_fscore_support

    try:
        precision, recall, f1, support = precision_recall_fscore_support(
            y_true, y_pred, labels=labels, zero_division=0
        )
    except Exception:  # noqa: BLE001 - report is best-effort
        return []
    return [
        {
            "label": str(label),
            "precision": round(float(p), 4),
            "recall": round(float(r), 4),
            "f1": round(float(f), 4),
            "support": int(s),
        }
        for label, p, r, f, s in zip(labels, precision, recall, f1, support)
    ]


def _regression_metrics(y_true, y_pred) -> dict[str, float]:
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

    mse = float(mean_squared_error(y_true, y_pred))
    metrics = {
        "r2": float(r2_score(y_true, y_pred)),
        "rmse": float(np.sqrt(mse)),
        "mse": mse,
        "mae": float(mean_absolute_error(y_true, y_pred)),
    }
    # MAPE is undefined when actuals contain zeros; report it only when safe.
    y_arr = np.asarray(y_true, dtype=float)
    nonzero = np.abs(y_arr) > 1e-9
    if nonzero.sum() >= max(5, int(0.5 * len(y_arr))):
        pred_arr = np.asarray(y_pred, dtype=float)
        mape = float(
            np.mean(np.abs((y_arr[nonzero] - pred_arr[nonzero]) / y_arr[nonzero]))
        )
        metrics["mape"] = mape
    return metrics


def _resolve_model_keys(
    task: Task, requested: list[str] | None, include: list[str] | None = None
) -> list[str]:
    available = {m.key for m in available_models(task)}
    if requested:
        keys = [k for k in requested if k in available]
        if keys:
            if include:
                keys += [k for k in include if k in available]
            return list(dict.fromkeys(keys))  # de-dupe, preserve order
        # None of the requested keys resolved (a synthetic key like "ensemble"
        # or a stale key): fall back to the task defaults instead of failing.
    defaults = _DEFAULT_CLF if task == "classification" else _DEFAULT_REG
    keys = [k for k in defaults if k in available]
    # Include any installed boosting plugins (xgboost/lightgbm/catboost).
    keys += [m.key for m in available_models(task) if "boosting" in m.tags]
    # Caller-requested extras (e.g. SVM/KNN) added on top of the fast defaults.
    if include:
        keys += [k for k in include if k in available]
    return list(dict.fromkeys(keys))  # de-dupe, preserve order


def _detect_leakage(
    data: pd.DataFrame,
    target: str,
    numeric: list[str],
    categorical: list[str],
    task: Task,
) -> list[dict[str, str]]:
    """Drop features that essentially *are* the target (in place).

    Conservative on purpose: only near-perfect associations are removed so
    legitimate strong predictors survive. Returns the removal report.
    """
    removed: list[dict[str, str]] = []
    y = data[target]

    if task == "regression":
        y_num = pd.to_numeric(y, errors="coerce")
        for col in list(numeric):
            try:
                pair = pd.concat(
                    [pd.to_numeric(data[col], errors="coerce"), y_num], axis=1
                ).dropna()
                if len(pair) < 10:
                    continue
                corr = float(pair.iloc[:, 0].corr(pair.iloc[:, 1]))
            except Exception:  # noqa: BLE001 - leakage checks are best-effort
                continue
            if pd.notna(corr) and abs(corr) >= 0.995:
                numeric.remove(col)
                removed.append(
                    {
                        "feature": col,
                        "reason": (
                            f"Almost perfectly correlated with the target "
                            f"(r={corr:.3f}) - likely a leaked copy of the answer."
                        ),
                    }
                )
    else:
        y_str = y.astype(str)
        for col in list(categorical):
            try:
                grp = pd.crosstab(data[col].astype(str), y_str)
                total = float(grp.values.sum())
                if grp.empty or grp.shape[0] < 2 or total == 0:
                    continue
                purity = float(grp.max(axis=1).sum()) / total
            except Exception:  # noqa: BLE001
                continue
            if purity >= 0.999:
                categorical.remove(col)
                removed.append(
                    {
                        "feature": col,
                        "reason": (
                            "Every value maps to a single outcome - the model "
                            "would just read the answer from this column."
                        ),
                    }
                )
    return removed


def _confidence_score(
    primary_score: float, task: Task, overfit: dict[str, Any] | None, cv_std: float | None
) -> float:
    """0-1 confidence: primary score, penalised by overfit gap + CV instability."""
    base = max(0.0, min(1.0, float(primary_score)))
    verdict = (overfit or {}).get("verdict", "moderate")
    penalty = {"low": 0.0, "moderate": 0.08, "high": 0.2}.get(verdict, 0.08)
    penalty += min(0.2, float(cv_std or 0.0) * 2.0)
    return round(max(0.0, min(1.0, base - penalty)), 4)


# A progress callback receives (fraction 0..1, stage key, optional log line).
# It is always best-effort: callback errors never break a training run.
ProgressCallback = Callable[[float, str, "str | None"], None]


def train_and_evaluate(
    df: pd.DataFrame,
    target: str,
    *,
    task: Task | None = None,
    model_keys: list[str] | None = None,
    test_size: float = 0.2,
    tune: bool = False,
    n_trials: int = 20,
    include_models: list[str] | None = None,
    features: list[str] | None = None,
    cv_folds: int = 3,
    random_state: int | None = None,
    hyperparameters: dict[str, Any] | None = None,
    ensemble: dict[str, Any] | None = None,
    fitting: dict[str, Any] | None = None,
    capture: dict[str, Any] | None = None,
    progress_cb: ProgressCallback | None = None,
    minimal: bool = False,
) -> dict[str, Any]:
    """Train every candidate model and return a ranked leaderboard + winner.

    When ``tune`` is set, the top few models are hyperparameter-tuned (Optuna if
    installed, else GridSearch/RandomizedSearchCV) and re-evaluated; the run
    reports the pre/post-tuning delta. The winner is enriched with ROC / learning
    curve / prediction-distribution / SHAP diagnostics and an AI advisor block.

    Manual Building extras (all optional):

    * ``hyperparameters`` — explicit estimator settings applied to the selected
      model (plain or ``model__``-prefixed keys, via ``Pipeline.set_params``).
    * ``ensemble`` — ``{type, baseModels, weights, votingStrategy, metaLearner}``
      config; when a valid ensemble builds it becomes the sole candidate.
    * ``fitting`` — scaling / encoding / sampling / class imbalance / leakage
      detection knobs from the Manual Workflow's fitting panel.

    ``features`` restricts modelling to an explicit column subset; ``cv_folds``
    controls the cross-validation used for tuning and stability scoring;
    ``random_state`` overrides the default seed. When ``capture`` is provided,
    the fitted winning pipeline is stored under ``capture["pipeline"]`` so the
    caller can persist it as a reusable artifact.
    """
    from sklearn.inspection import permutation_importance
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import Pipeline

    from app.services.ml.artifacts import build_input_schema

    if target not in df.columns:
        raise AutoMLError(f"Target column '{target}' not found.")

    def notify(frac: float, stage: str, message: str | None = None) -> None:
        if progress_cb is None:
            return
        try:
            progress_cb(max(0.0, min(1.0, frac)), stage, message)
        except Exception:  # noqa: BLE001 - progress reporting is best-effort
            pass

    rs = _RANDOM_STATE if random_state is None else int(random_state)
    notify(0.02, "detect", "Detecting task type from the target column…")
    task = task or infer_task(df, target)
    notify(0.04, "detect", f"Task detected: {task}.")

    # Drop rows with a missing target; cap rows for responsiveness.
    data = df.dropna(subset=[target])
    if len(data) < 20:
        raise AutoMLError("Need at least 20 labelled rows to train models.")
    if len(data) > _ROW_CAP:
        data = data.sample(_ROW_CAP, random_state=rs).reset_index(drop=True)

    numeric, categorical = _select_features(data, target)
    if features:
        allowed = set(features)
        numeric = [c for c in numeric if c in allowed]
        categorical = [c for c in categorical if c in allowed]
    fitting = fitting or {}
    detect_leakage = bool(fitting.get("leakage_detection", True))
    notify(
        0.06,
        "preprocess",
        f"Selected {len(numeric) + len(categorical)} usable feature(s);"
        + (" checking for leakage…" if detect_leakage else " leakage detection disabled…"),
    )
    leakage_removed = (
        _detect_leakage(data, target, numeric, categorical, task) if detect_leakage else []
    )
    if leakage_removed:
        notify(
            0.07,
            "preprocess",
            f"Removed {len(leakage_removed)} leaky feature(s): "
            + ", ".join(r["feature"] for r in leakage_removed),
        )
    features_used = numeric + categorical
    if not features_used:
        raise AutoMLError("No usable feature columns found for this target.")

    X = data[features_used]
    y = data[target]
    if task == "classification":
        y = y.astype(str)

    # Stratify classification when every class has >=2 samples.
    stratify = None
    if task == "classification":
        counts = y.value_counts()
        if counts.min() >= 2 and len(counts) < len(y):
            stratify = y
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=rs, stratify=stratify
    )
    notify(
        0.09,
        "split",
        f"Split {len(X_train):,} train / {len(X_test):,} test rows "
        f"({int(round(test_size * 100))}% hold-out).",
    )

    keys = _resolve_model_keys(task, model_keys, include_models)
    primary = "f1_weighted" if task == "classification" else "r2"
    labels = sorted(y.unique().tolist()) if task == "classification" else []

    # Manual fitting knobs: scaling, encoding, sampling, class imbalance.
    scaling = str(fitting.get("scaling") or "standard")
    encoding = str(fitting.get("encoding") or "onehot")
    class_imbalance = bool(fitting.get("class_imbalance", False))
    sampler = None
    if task == "classification" and fitting.get("sampling") in ("smote", "undersample"):
        try:
            from imblearn.over_sampling import SMOTE
            from imblearn.under_sampling import RandomUnderSampler

            if fitting["sampling"] == "smote":
                sampler = SMOTE(random_state=rs)
            else:
                sampler = RandomUnderSampler(random_state=rs)
            notify(0.08, "preprocess", f"Applying {fitting['sampling']} to balance classes…")
        except Exception:  # noqa: BLE001 - sampling is best-effort
            sampler = None

    # Optional ensemble candidate (Manual Mode): replaces individual models.
    from app.services.ml.ensembles import build_ensemble, ensemble_label

    ensemble_est = None
    if ensemble and ensemble.get("baseModels"):
        ensemble_est = build_ensemble(ensemble, task)
        if ensemble_est is None:
            notify(
                0.05,
                "preprocess",
                "The ensemble configuration could not be built — falling back to individual models.",
            )

    def _build_estimator(key: str) -> Any:
        spec = get_model(key)
        est = spec.builder()
        if class_imbalance and task == "classification" and hasattr(est, "class_weight"):
            try:
                est.set_params(class_weight="balanced")
            except Exception:  # noqa: BLE001 - best-effort
                pass
        return est

    def _build_pipeline(estimator: Any) -> Any:
        steps = [("prep", _build_preprocessor(numeric, categorical, scaling, encoding))]
        if sampler is not None:
            steps.append(("sample", sampler))
        steps.append(("model", estimator))
        if sampler is not None:
            from imblearn.pipeline import Pipeline as ImbPipeline

            return ImbPipeline(steps)
        return Pipeline(steps)

    def _apply_params(pipe: Any, params: dict[str, Any] | None) -> Any:
        """Apply explicit hyperparameters, tolerating plain (unprefixed) keys.

        String literals ``"None"`` / ``"null"`` (typed into the manual-tweak
        fields) are mapped to real ``None`` so optional parameters like
        ``max_depth`` actually take effect.
        """
        if not params:
            return pipe
        normalized: dict[str, Any] = {}
        for k, v in params.items():
            nk = k if k.startswith(("model__", "prep__", "sample__")) else f"model__{k}"
            if isinstance(v, str) and v.strip().lower() in ("none", "null", ""):
                normalized[nk] = None
            else:
                normalized[nk] = v
        try:
            pipe.set_params(**normalized)
        except (ValueError, KeyError, TypeError):  # pragma: no cover - defensive
            pass
        return pipe

    # (key, label, builder) candidates: the ensemble first when configured.
    builders: dict[str, Callable[[dict[str, Any] | None], Any]] = {}
    candidates: list[tuple[str, str, Callable[[dict[str, Any] | None], Any]]] = []
    if ensemble_est is not None:
        candidates.append(
            (
                "ensemble",
                ensemble_label(ensemble) or "Ensemble",
                lambda p=None: _apply_params(_build_pipeline(ensemble_est), p),
            )
        )
    else:
        for key in keys:
            spec = get_model(key)
            if spec is None:
                continue
            candidates.append(
                (
                    key,
                    spec.label,
                    lambda p=None, k=key: _apply_params(
                        _build_pipeline(_build_estimator(k)),
                        p if p is not None else hyperparameters,
                    ),
                )
            )
    for key, _, build in candidates:
        builders[key] = build

    def evaluate(pipe) -> dict[str, float]:
        y_pred = pipe.predict(X_test)
        if task == "classification":
            proba = None
            if hasattr(pipe, "predict_proba"):
                try:
                    proba = pipe.predict_proba(X_test)
                except (ValueError, AttributeError):
                    proba = None
            return _classification_metrics(y_test, y_pred, proba, labels)
        return _regression_metrics(y_test, y_pred)

    leaderboard: list[dict[str, Any]] = []
    fitted: dict[str, Any] = {}
    # Progress band for model training: tuning gets its own band afterwards.
    train_lo, train_hi = 0.10, (0.50 if tune else 0.70)
    for pos, (key, label, build) in enumerate(candidates):
        notify(
            train_lo + (train_hi - train_lo) * (pos / max(1, len(candidates))),
            "train",
            f"Training {label} ({pos + 1}/{len(candidates)})…",
        )
        pipe = build(None)
        started = time.perf_counter()
        try:
            pipe.fit(X_train, y_train)
            train_seconds = round(time.perf_counter() - started, 3)
            pred_started = time.perf_counter()
            metrics = evaluate(pipe)
            predict_seconds = round(time.perf_counter() - pred_started, 4)
        except Exception as exc:  # noqa: BLE001 - one bad model shouldn't fail all
            leaderboard.append(
                {"key": key, "label": label, "error": str(exc), "metrics": {}}
            )
            notify(
                train_lo + (train_hi - train_lo) * ((pos + 1) / max(1, len(candidates))),
                "train",
                f"{label} failed: {exc}",
            )
            continue
        fitted[key] = pipe
        leaderboard.append(
            {
                "key": key,
                "label": label,
                "metrics": {k: round(v, 4) for k, v in metrics.items()},
                "train_seconds": train_seconds,
                "predict_seconds": predict_seconds,
                "tuned": False,
            }
        )
        notify(
            train_lo + (train_hi - train_lo) * ((pos + 1) / max(1, len(candidates))),
            "train",
            f"{label}: {primary}={metrics.get(primary, 0.0):.4f} ({train_seconds}s)",
        )

    scored = [e for e in leaderboard if e.get("metrics")]
    if not scored:
        raise AutoMLError("All candidate models failed to train on this data.")

    def rank(entries: list[dict[str, Any]]) -> None:
        entries.sort(key=lambda e: e["metrics"].get(primary, float("-inf")), reverse=True)
        for i, entry in enumerate(entries, start=1):
            entry["rank"] = i

    rank(scored)
    pre_tune_best = scored[0]["metrics"].get(primary, 0.0)

    # --- Optional hyperparameter tuning of the top-N models -------------------
    tuning_info: dict[str, Any] = {"enabled": False, "history": []}
    if tune:
        method = "none"
        tuned_keys: list[str] = []
        tuning_history: list[dict[str, Any]] = []
        to_tune = scored[: _TUNE_TOP_N]
        for pos, entry in enumerate(to_tune):
            key = entry["key"]
            build = builders.get(key)
            if build is None:
                continue
            notify(
                0.52 + 0.26 * (pos / max(1, len(to_tune))),
                "optimize",
                f"Optimizing hyperparameters for {entry['label']} "
                f"({pos + 1}/{len(to_tune)}, {n_trials} trials)…",
            )
            res = tune_model(
                build, key, task, X_train, y_train,
                n_trials=n_trials, cv=cv_folds,
            )
            if not res["tuned"]:
                continue
            pipe = build(res["params"])
            try:
                pipe.fit(X_train, y_train)
                metrics = evaluate(pipe)
            except Exception:  # noqa: BLE001 - keep pre-tuning result on failure
                continue
            entry["metrics"] = {k: round(v, 4) for k, v in metrics.items()}
            entry["tuned"] = True
            entry["best_params"] = res["params"]
            entry["cv_score"] = res["score"]
            entry["tuning_history"] = res.get("history", [])
            tuning_history.extend(res.get("history", []))
            fitted[key] = pipe
            tuned_keys.append(key)
            if method == "none":
                method = res["method"]
            notify(
                0.52 + 0.26 * ((pos + 1) / max(1, len(to_tune))),
                "optimize",
                f"{entry['label']} tuned via {res['method']}: "
                f"{primary}={metrics.get(primary, 0.0):.4f}",
            )
        rank(scored)
        post_tune_best = scored[0]["metrics"].get(primary, 0.0)
        tuning_info = {
            "enabled": True,
            "method": method,
            "n_trials": n_trials,
            "models_tuned": tuned_keys,
            "pre_score": round(float(pre_tune_best), 4),
            "post_score": round(float(post_tune_best), 4),
            "delta": round(float(post_tune_best) - float(pre_tune_best), 4),
            "improved": post_tune_best > pre_tune_best,
            "history": tuning_history[:12],
        }

    # Cross-validated stability (mean +/- std of the primary metric) for the
    # top models, so the leaderboard is not judged on a single split alone.
    from sklearn.model_selection import cross_val_score

    notify(0.80, "cross_validate", f"Cross-validating top models ({cv_folds}-fold)…")
    for entry in scored[:_TUNE_TOP_N]:
        build = builders.get(entry["key"])
        if build is None:
            continue
        try:
            cv_scores = cross_val_score(
                build(entry.get("best_params")),
                X,
                y,
                scoring=primary,
                cv=cv_folds,
                n_jobs=1,
            )
            entry["cv_mean"] = round(float(cv_scores.mean()), 4)
            entry["cv_std"] = round(float(cv_scores.std()), 4)
            entry["cv_folds"] = [round(float(s), 4) for s in cv_scores]
        except Exception:  # noqa: BLE001 - stability scoring is best-effort
            continue

    failed = [e for e in leaderboard if not e.get("metrics")]

    best = scored[0]
    best_pipe = fitted[best["key"]]
    best_params = best.get("best_params")

    # ``minimal`` mode skips the heavy explanation block (permutation importance,
    # learning curve, SHAP, confusion/ROC/residuals, advisor) so a signal scan
    # can evaluate many targets quickly. The leaderboard, CV, leakage, input
    # schema and confidence are kept, so results stay comparable to a full run.
    if not minimal:
        notify(0.88, "explain", f"Best model: {best['label']}. Generating explanations…")
        importance = _permutation_importance(
            permutation_importance, best_pipe, X_test, y_test, features_used
        )
        y_pred_best = best_pipe.predict(X_test)
    else:
        importance = []
        y_pred_best = None
        notify(0.88, "explain", f"Best model: {best['label']}. Finalizing…")

    result: dict[str, Any] = {
        "task": task,
        "target": target,
        "primary_metric": primary,
        "features": features_used,
        "n_rows_used": int(len(data)),
        "n_features": len(features_used),
        "test_size": test_size,
        "leaderboard": scored + failed,
        "tuning": tuning_info,
        "leakage": {"removed": leakage_removed},
        "input_schema": build_input_schema(X_train, numeric, categorical),
        "best": {
            "key": best["key"],
            "label": best["label"],
            "metrics": best["metrics"],
            "feature_importance": importance,
            "params": diagnostics.model_params(best_pipe),
            "tuned": bool(best.get("tuned")),
            "best_params": best_params or {},
        },
    }
    if not minimal:
        result["best"]["learning_curve"] = diagnostics.learning_curve_points(
            lambda: builders[best["key"]](best_params), task, X, y
        )
        result["best"]["prediction_distribution"] = diagnostics.prediction_distribution(
            y_test, y_pred_best, task
        )

    # Train-vs-test overfitting gap on the primary metric (cheap; feeds confidence).
    y_train_pred = best_pipe.predict(X_train)
    if task == "classification":
        train_metrics = _classification_metrics(y_train, y_train_pred, None, labels)
    else:
        train_metrics = _regression_metrics(y_train, y_train_pred)
    result["best"]["overfit"] = diagnostics.overfit_gap(
        train_metrics.get(primary, 0.0), best["metrics"].get(primary, 0.0)
    )
    result["best"]["confidence"] = _confidence_score(
        best["metrics"].get(primary, 0.0), task, result["best"]["overfit"], best.get("cv_std")
    )

    if task == "classification":
        result["classes"] = [str(c) for c in labels]

    if not minimal:
        shap_block = diagnostics.shap_importance(best_pipe, X_test, features_used)
        if shap_block:
            result["best"]["shap"] = shap_block
        if task == "classification":
            result["best"]["confusion_matrix"] = _confusion(best_pipe, X_test, y_test, labels)
            result["best"]["classification_report"] = _classification_report(
                y_test, y_pred_best, labels
            )
            result["best"]["roc_curve"] = diagnostics.roc_curve_points(
                best_pipe, X_test, y_test, labels
            )
        else:
            resid = np.asarray(y_test, dtype=float) - np.asarray(y_pred_best, dtype=float)
            result["best"]["residuals"] = {
                "mean": _py(round(float(resid.mean()), 4)),
                "std": _py(round(float(resid.std()), 4)),
            }
            result["best"]["residual_series"] = diagnostics.residual_series(y_test, y_pred_best)

        result["advisor"] = advisor.build_advice(result)
        notify(0.99, "explain", "Explanations ready. Finalizing results…")
    if capture is not None:
        capture["pipeline"] = best_pipe
    return result


def _permutation_importance(
    perm_fn, pipe, X_test, y_test, features: list[str]
) -> list[dict[str, Any]]:
    try:
        result = perm_fn(
            pipe, X_test, y_test, n_repeats=5, random_state=_RANDOM_STATE, n_jobs=1
        )
    except Exception:  # noqa: BLE001 - importance is best-effort
        return []
    means = result.importances_mean
    order = np.argsort(means)[::-1]
    out = []
    for idx in order:
        val = float(means[idx])
        out.append({"feature": features[idx], "importance": round(val, 4)})
    return out[:15]


def _confusion(pipe, X_test, y_test, labels) -> dict[str, Any]:
    from sklearn.metrics import confusion_matrix

    preds = pipe.predict(X_test)
    matrix = confusion_matrix(y_test, preds, labels=labels)
    return {
        "labels": [str(c) for c in labels],
        "matrix": [[int(v) for v in row] for row in matrix],
    }
