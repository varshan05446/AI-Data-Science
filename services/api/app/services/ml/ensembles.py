"""Ensemble builders for Manual Model Building.

Wraps the registered base estimators into voting / stacking / bagging /
blending ensembles that slot into the existing sklearn ``Pipeline`` under the
``"model"`` step, so pre-processing, diagnostics, artifacts and the Playground
keep working unchanged. Everything is best-effort: an invalid or unsupported
configuration returns ``None`` and the training engine falls back gracefully.
"""
from __future__ import annotations

from typing import Any

from app.services.ml.registry import Task, get_model

_RANDOM_STATE = 42


def _meta_estimator(key: str | None, task: Task) -> Any:
    """Build the stacking meta-learner (defaults per task)."""
    if key:
        spec = get_model(key)
        if spec is not None and spec.task == task:
            try:
                return spec.builder()
            except Exception:  # noqa: BLE001 - best-effort
                pass
    if task == "classification":
        from sklearn.linear_model import LogisticRegression

        return LogisticRegression(max_iter=1000)
    from sklearn.linear_model import Ridge

    return Ridge()


def _weights_list(weights: Any, estimators: list[tuple[str, Any]]) -> list[float] | None:
    """Normalise a ``{key: weight}`` map into the estimator-order weight list."""
    if not weights or not isinstance(weights, dict):
        return None
    try:
        out = [float(weights.get(k, 1.0)) for k, _ in estimators]
        return out if len(out) == len(estimators) else None
    except (TypeError, ValueError):  # noqa: BLE001 - best-effort
        return None


def _bagging(base: Any) -> Any:
    """Bagging wrapper that tolerates the sklearn param rename."""
    try:
        from sklearn.ensemble import BaggingClassifier as BC  # noqa: N811
        from sklearn.ensemble import BaggingRegressor as BR  # noqa: N811
    except ImportError:  # pragma: no cover
        return None
    is_clf = hasattr(base, "classes_") or hasattr(base, "predict_proba")
    try:
        import inspect

        klass = BC if is_clf else BR
        sig = inspect.signature(klass.__init__)
        kw = {"estimator": base} if "estimator" in sig.parameters else {"base_estimator": base}
        return klass(n_estimators=10, random_state=_RANDOM_STATE, **kw)
    except Exception:  # noqa: BLE001 - best-effort
        return None


def build_ensemble(cfg: dict[str, Any] | None, task: Task) -> Any | None:
    """Return a fit-able sklearn ensemble estimator, or ``None``.

    ``cfg`` mirrors the Manual Workflow's Ensemble Builder payload:
    ``{type, baseModels, metaLearner, votingStrategy, weights}``. Unsupported
    strategies (``blending`` / ``custom``) fall back to weighted voting.
    """
    if not cfg:
        return None
    keys = cfg.get("baseModels") or cfg.get("base_models") or []
    if not keys:
        return None

    estimators: list[tuple[str, Any]] = []
    for key in keys:
        spec = get_model(key)
        if spec is None or spec.task != task:
            continue
        try:
            estimators.append((key, spec.builder()))
        except Exception:  # noqa: BLE001 - skip broken builders
            continue
    if not estimators:
        return None

    etype = str(cfg.get("type") or "voting").lower()
    weights = _weights_list(cfg.get("weights"), estimators)
    try:
        if etype == "stacking":
            from sklearn.ensemble import (
                StackingClassifier,
                StackingRegressor,
            )

            meta = _meta_estimator(
                cfg.get("metaLearner") or cfg.get("meta_learner"), task
            )
            klass = StackingClassifier if task == "classification" else StackingRegressor
            return klass(
                estimators,
                final_estimator=meta,
                cv=3,
                n_jobs=1,
            )
        if etype == "bagging":
            return _bagging(estimators[0][1])
        # voting / blending / custom → (soft) weighted voting.
        if task == "classification":
            from sklearn.ensemble import VotingClassifier

            voting = str(cfg.get("votingStrategy") or cfg.get("voting") or "soft")
            if voting not in ("hard", "soft"):
                voting = "soft"
            return VotingClassifier(estimators, voting=voting, weights=weights, n_jobs=1)
        from sklearn.ensemble import VotingRegressor

        return VotingRegressor(estimators, weights=weights, n_jobs=1)
    except Exception:  # noqa: BLE001 - invalid ensembles must never crash training
        return None


def ensemble_label(cfg: dict[str, Any] | None) -> str | None:
    """Human label for the ensemble candidate, e.g. ``Stacking Ensemble (3 models)``."""
    if not cfg:
        return None
    keys = cfg.get("baseModels") or cfg.get("base_models") or []
    if not keys:
        return None
    etype = str(cfg.get("type") or "voting").capitalize()
    return f"{etype} Ensemble ({len(keys)} models)"
