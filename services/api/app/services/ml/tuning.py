"""Hyperparameter tuning for the AutoML engine.

Small, fully discrete search spaces are searched exhaustively with
``GridSearchCV``. Larger/continuous spaces use **Optuna** (Bayesian TPE search)
when installed, otherwise scikit-learn ``RandomizedSearchCV``. All strategies
operate on the full sklearn Pipeline (preprocessor + estimator) via
cross-validation and return the best params plus the best cross-validated
score. Every path is wrapped so a tuning failure never breaks the surrounding
training run.
"""
from __future__ import annotations

from typing import Any, Callable

import numpy as np

from app.services.ml.registry import has_library, search_space_for

_CV = 3
_RANDOM_STATE = 42
# Exhaustive GridSearchCV is only practical for small grids; beyond this we
# switch to Optuna / RandomizedSearchCV per the tuning strategy.
_MAX_GRID_SIZE = 48
_MAX_INT_SPAN = 6  # int ranges wider than this are not enumerable for a grid
# How many tested parameter combinations to keep in the returned history
# (every combination tested is recorded; this caps what travels to the UI).
_MAX_HISTORY = 12


def scoring_for(task: str) -> str:
    """Cross-validation scoring metric (higher is better for both)."""
    return "f1_weighted" if task == "classification" else "r2"


def _grid_candidates(space: dict[str, dict[str, Any]]) -> "dict[str, list[Any]] | None":
    """Discretize a search space into a small exhaustive grid, if practical.

    Returns ``None`` when the space contains continuous floats or wide integer
    ranges, or when the total number of combinations exceeds ``_MAX_GRID_SIZE``.
    """
    grid: dict[str, list[Any]] = {}
    total = 1
    for name, spec in space.items():
        kind = spec["type"]
        if kind == "categorical":
            values = list(spec["choices"])
        elif kind == "int" and not spec.get("log"):
            low, high = int(spec["low"]), int(spec["high"])
            if high - low + 1 > _MAX_INT_SPAN:
                return None
            values = list(range(low, high + 1))
        else:
            return None  # floats / log ranges are inherently continuous
        grid[name] = values
        total *= len(values)
        if total > _MAX_GRID_SIZE:
            return None
    return grid


def _suggest(trial: Any, name: str, spec: dict[str, Any]) -> Any:
    kind = spec["type"]
    if kind == "int":
        return trial.suggest_int(name, spec["low"], spec["high"], log=spec.get("log", False))
    if kind == "float":
        return trial.suggest_float(name, spec["low"], spec["high"], log=spec.get("log", False))
    return trial.suggest_categorical(name, spec["choices"])


def _to_distributions(space: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Translate a search space into scipy distributions for RandomizedSearchCV."""
    from scipy.stats import loguniform, randint, uniform

    dist: dict[str, Any] = {}
    for name, spec in space.items():
        kind = spec["type"]
        if kind == "int":
            dist[name] = randint(spec["low"], spec["high"] + 1)
        elif kind == "float":
            if spec.get("log"):
                dist[name] = loguniform(spec["low"], spec["high"])
            else:
                dist[name] = uniform(spec["low"], spec["high"] - spec["low"])
        else:
            dist[name] = list(spec["choices"])
    return dist


def tune_model(
    make_pipeline: Callable[[], Any],
    key: str,
    task: str,
    X: Any,
    y: Any,
    *,
    n_trials: int = 20,
    cv: int = _CV,
) -> dict[str, Any]:
    """Tune one model key and return a JSON-safe result.

    Returns a dict with ``params`` (best params), ``score`` (best CV score or
    ``None``), ``method`` (``optuna`` | ``random`` | ``none``), ``tuned``
    (bool) and ``history`` (tested parameter combinations with their
    cross-validated scores, best first). ``make_pipeline`` must return a fresh,
    unfitted Pipeline.
    """
    space = search_space_for(key)
    if not space:
        return {
            "params": {},
            "score": None,
            "method": "none",
            "tuned": False,
            "history": [],
        }

    scoring = scoring_for(task)
    try:
        grid = _grid_candidates(space)
        if grid is not None:
            # Small discrete space: exhaustive search is practical.
            params, score, history = _grid(make_pipeline, grid, scoring, X, y, cv)
            method = "grid"
        elif has_library("optuna"):
            params, score, history = _optuna(
                make_pipeline, space, scoring, X, y, n_trials, cv
            )
            method = "optuna"
        else:
            params, score, history = _random(
                make_pipeline, space, scoring, X, y, n_trials, cv
            )
            method = "random"
    except Exception:  # noqa: BLE001 - tuning is best-effort; never fatal
        return {
            "params": {},
            "score": None,
            "method": "none",
            "tuned": False,
            "history": [],
        }

    return {
        "params": {k: _jsonable(v) for k, v in params.items()},
        "score": None if score is None else round(float(score), 4),
        "method": method,
        "tuned": bool(params),
        "history": history,
    }


def _history_from_results(results: dict[str, Any]) -> list[dict[str, Any]]:
    """Top-N tested combinations from ``GridSearchCV.cv_results_``."""
    scores = np.asarray(results.get("mean_test_score") or [])
    if scores.size == 0:
        return []
    order = np.argsort(scores)[::-1][:_MAX_HISTORY]
    out: list[dict[str, Any]] = []
    for idx in order:
        params = results["params"][int(idx)]
        out.append(
            {
                "params": {k: _jsonable(v) for k, v in params.items()},
                "score": round(float(scores[int(idx)]), 4),
            }
        )
    return out


def _grid(make_pipeline, grid, scoring, X, y, cv):  # noqa: ANN001
    from sklearn.model_selection import GridSearchCV

    search = GridSearchCV(
        make_pipeline(),
        grid,
        scoring=scoring,
        cv=cv,
        n_jobs=1,
    )
    search.fit(X, y)
    history = _history_from_results(search.cv_results_)
    return dict(search.best_params_), float(search.best_score_), history


def _optuna(make_pipeline, space, scoring, X, y, n_trials, cv):  # noqa: ANN001
    import optuna
    from sklearn.model_selection import cross_val_score

    optuna.logging.set_verbosity(optuna.logging.WARNING)

    def objective(trial: Any) -> float:
        params = {name: _suggest(trial, name, spec) for name, spec in space.items()}
        pipe = make_pipeline()
        pipe.set_params(**params)
        scores = cross_val_score(pipe, X, y, scoring=scoring, cv=cv, n_jobs=1)
        return float(np.mean(scores))

    study = optuna.create_study(
        direction="maximize",
        sampler=optuna.samplers.TPESampler(seed=_RANDOM_STATE),
    )
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)
    history: list[dict[str, Any]] = []
    for trial in sorted(study.trials, key=lambda t: t.value or -1.0, reverse=True)[
        :_MAX_HISTORY
    ]:
        if trial.value is None:
            continue
        history.append(
            {
                "params": {k: _jsonable(v) for k, v in trial.params.items()},
                "score": round(float(trial.value), 4),
            }
        )
    return dict(study.best_params), float(study.best_value), history


def _random(make_pipeline, space, scoring, X, y, n_trials, cv):  # noqa: ANN001
    from sklearn.model_selection import RandomizedSearchCV

    search = RandomizedSearchCV(
        make_pipeline(),
        _to_distributions(space),
        n_iter=n_trials,
        scoring=scoring,
        cv=cv,
        random_state=_RANDOM_STATE,
        n_jobs=1,
    )
    search.fit(X, y)
    history = _history_from_results(search.cv_results_)
    return dict(search.best_params_), float(search.best_score_), history


def _jsonable(value: Any) -> Any:
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return round(float(value), 6)
    return value
