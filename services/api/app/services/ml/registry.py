"""Extensible model registry for the AutoML engine.

Design goals (per product spec):

* scikit-learn is the required base: its stable estimators are always available.
* Advanced libraries (XGBoost, LightGBM, CatBoost, ...) are optional plugins,
  detected at runtime. If installed they appear automatically; if not they are
  skipped without error.
* Adding a new algorithm is a one-line :func:`register` call - the training
  pipeline never needs to change.
"""
from __future__ import annotations

import importlib.util
from dataclasses import dataclass, field
from typing import Any, Callable, Literal

Task = Literal["classification", "regression", "clustering"]


def has_library(module: str) -> bool:
    """True if an optional dependency is importable in this environment."""
    return importlib.util.find_spec(module) is not None


@dataclass
class ModelSpec:
    """A registered algorithm.

    ``builder`` is a zero-arg callable returning a fresh, unfitted estimator; it
    is lazy so importing this module never imports heavy optional libraries.
    """

    key: str
    label: str
    task: Task
    builder: Callable[[], Any]
    requires: str | None = None  # optional module that must be importable
    params: dict[str, Any] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)
    # Hyperparameter search space (pipeline-prefixed ``model__*`` keys). Consumed
    # by :mod:`app.services.ml.tuning` for Optuna / RandomizedSearchCV tuning.
    search_space: dict[str, dict[str, Any]] = field(default_factory=dict)

    @property
    def available(self) -> bool:
        if self.requires is not None and not has_library(self.requires):
            return False
        try:
            self.builder()
            return True
        except Exception:
            return False


_REGISTRY: dict[str, ModelSpec] = {}


def register(spec: ModelSpec) -> ModelSpec:
    _REGISTRY[spec.key] = spec
    return spec


def available_models(task: Task | None = None) -> list[ModelSpec]:
    """All installed models, optionally filtered by task."""
    specs = [s for s in _REGISTRY.values() if s.available]
    if task is not None:
        specs = [s for s in specs if s.task == task]
    return specs


def get_model(key: str) -> ModelSpec | None:
    return _REGISTRY.get(key)


def search_space_for(key: str) -> dict[str, dict[str, Any]]:
    """Return the (possibly empty) tuning search space for a model key."""
    spec = _REGISTRY.get(key)
    return dict(spec.search_space) if spec else {}


def _register_sklearn_baseline() -> None:
    """Register the always-available scikit-learn estimators."""
    from sklearn.cluster import DBSCAN, AgglomerativeClustering, KMeans
    from sklearn.ensemble import (
        AdaBoostClassifier,
        AdaBoostRegressor,
        ExtraTreesClassifier,
        ExtraTreesRegressor,
        GradientBoostingClassifier,
        GradientBoostingRegressor,
        RandomForestClassifier,
        RandomForestRegressor,
    )
    from sklearn.linear_model import (
        ElasticNet,
        Lasso,
        LinearRegression,
        LogisticRegression,
        Ridge,
    )
    from sklearn.naive_bayes import GaussianNB
    from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
    from sklearn.svm import SVC, SVR
    from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

    clf = [
        ("logistic_regression", "Logistic Regression", lambda: LogisticRegression(max_iter=1000)),
        ("decision_tree_clf", "Decision Tree", lambda: DecisionTreeClassifier()),
        ("random_forest_clf", "Random Forest", lambda: RandomForestClassifier(n_estimators=200)),
        ("extra_trees_clf", "Extra Trees", lambda: ExtraTreesClassifier(n_estimators=200)),
        ("gradient_boosting_clf", "Gradient Boosting", lambda: GradientBoostingClassifier()),
        ("adaboost_clf", "AdaBoost", lambda: AdaBoostClassifier()),
        ("svc", "Support Vector Machine", lambda: SVC(probability=True)),
        ("knn_clf", "K-Nearest Neighbors", lambda: KNeighborsClassifier()),
        ("naive_bayes", "Naive Bayes", lambda: GaussianNB()),
    ]
    for key, label, builder in clf:
        register(ModelSpec(key=key, label=label, task="classification", builder=builder))

    reg = [
        ("linear_regression", "Linear Regression", lambda: LinearRegression()),
        ("ridge", "Ridge", lambda: Ridge()),
        ("lasso", "Lasso", lambda: Lasso()),
        ("elastic_net", "Elastic Net", lambda: ElasticNet()),
        ("decision_tree_reg", "Decision Tree", lambda: DecisionTreeRegressor()),
        ("random_forest_reg", "Random Forest", lambda: RandomForestRegressor(n_estimators=200)),
        ("extra_trees_reg", "Extra Trees", lambda: ExtraTreesRegressor(n_estimators=200)),
        ("gradient_boosting_reg", "Gradient Boosting", lambda: GradientBoostingRegressor()),
        ("adaboost_reg", "AdaBoost", lambda: AdaBoostRegressor()),
        ("svr", "Support Vector Machine", lambda: SVR()),
        ("knn_reg", "K-Nearest Neighbors", lambda: KNeighborsRegressor()),
    ]
    for key, label, builder in reg:
        register(ModelSpec(key=key, label=label, task="regression", builder=builder))

    cluster = [
        ("kmeans", "KMeans", lambda: KMeans(n_clusters=3, n_init=10)),
        ("dbscan", "DBSCAN", lambda: DBSCAN()),
        ("agglomerative", "Agglomerative Clustering", lambda: AgglomerativeClustering()),
    ]
    for key, label, builder in cluster:
        register(ModelSpec(key=key, label=label, task="clustering", builder=builder))


def _register_optional() -> None:
    """Register advanced libraries only when importable (graceful skip)."""
    if has_library("xgboost"):
        def _xgb_clf() -> Any:
            from sklearn.pipeline import Pipeline
            from sklearn.preprocessing import LabelEncoder
            from xgboost import XGBClassifier

            class _XGBStrLabelClassifier(XGBClassifier):
                """XGBoost wrapper that tolerates string class labels (XGB 3.x)."""
                def fit(self, X, y, **kw):
                    from sklearn.preprocessing import LabelEncoder
                    self._le = LabelEncoder()
                    return super().fit(X, self._le.fit_transform(y), **kw)

                def predict(self, X, **kw):
                    return self._le.inverse_transform(super().predict(X, **kw))

                def predict_proba(self, X, **kw):
                    return super().predict_proba(X, **kw)

            return _XGBStrLabelClassifier(eval_metric="logloss", tree_method="hist")

        def _xgb_reg() -> Any:
            from xgboost import XGBRegressor
            return XGBRegressor(tree_method="hist")

        register(ModelSpec("xgboost_clf", "XGBoost", "classification", _xgb_clf,
                           requires="xgboost", tags=["boosting"]))
        register(ModelSpec("xgboost_reg", "XGBoost", "regression", _xgb_reg,
                           requires="xgboost", tags=["boosting"]))

    if has_library("lightgbm"):
        def _lgbm_clf() -> Any:
            from lightgbm import LGBMClassifier

            return LGBMClassifier()

        def _lgbm_reg() -> Any:
            from lightgbm import LGBMRegressor

            return LGBMRegressor()

        register(ModelSpec("lightgbm_clf", "LightGBM", "classification", _lgbm_clf,
                           requires="lightgbm", tags=["boosting"]))
        register(ModelSpec("lightgbm_reg", "LightGBM", "regression", _lgbm_reg,
                           requires="lightgbm", tags=["boosting"]))

    if has_library("catboost"):
        def _cat_clf() -> Any:
            from catboost import CatBoostClassifier

            return CatBoostClassifier(verbose=False)

        def _cat_reg() -> Any:
            from catboost import CatBoostRegressor

            return CatBoostRegressor(verbose=False)

        register(ModelSpec("catboost_clf", "CatBoost", "classification", _cat_clf,
                           requires="catboost", tags=["boosting"]))
        register(ModelSpec("catboost_reg", "CatBoost", "regression", _cat_reg,
                           requires="catboost", tags=["boosting"]))


def optional_capabilities() -> dict[str, bool]:
    """Report which optional libraries are present (surfaced in the UI)."""
    return {
        "xgboost": has_library("xgboost"),
        "lightgbm": has_library("lightgbm"),
        "catboost": has_library("catboost"),
        "shap": has_library("shap"),
        "optuna": has_library("optuna"),
        "statsmodels": has_library("statsmodels"),
    }


# --- Hyperparameter search spaces --------------------------------------------
# Each space maps a pipeline-prefixed parameter to a lightweight spec that both
# Optuna (native suggest_*) and RandomizedSearchCV (scipy distributions) can
# consume. Types: ``int`` / ``float`` (optional ``log``) / ``categorical``.
_SEARCH_SPACES: dict[str, dict[str, dict[str, Any]]] = {
    # Classification
    "logistic_regression": {
        "model__C": {"type": "float", "low": 1e-3, "high": 1e2, "log": True},
        # liblinear + saga both support l1 and l2, so every combo is valid.
        "model__penalty": {"type": "categorical", "choices": ["l1", "l2"]},
        "model__solver": {"type": "categorical", "choices": ["liblinear", "saga"]},
    },
    "decision_tree_clf": {
        "model__criterion": {"type": "categorical", "choices": ["gini", "entropy"]},
        "model__splitter": {"type": "categorical", "choices": ["best", "random"]},
        "model__max_depth": {"type": "int", "low": 2, "high": 24},
        "model__min_samples_split": {"type": "int", "low": 2, "high": 20},
        "model__min_samples_leaf": {"type": "int", "low": 1, "high": 10},
    },
    "random_forest_clf": {
        "model__n_estimators": {"type": "int", "low": 100, "high": 400},
        "model__max_depth": {"type": "int", "low": 3, "high": 24},
        "model__min_samples_split": {"type": "int", "low": 2, "high": 12},
        "model__min_samples_leaf": {"type": "int", "low": 1, "high": 8},
        "model__max_features": {"type": "categorical", "choices": ["sqrt", "log2"]},
    },
    "extra_trees_clf": {
        "model__n_estimators": {"type": "int", "low": 100, "high": 400},
        "model__max_depth": {"type": "int", "low": 3, "high": 24},
        "model__min_samples_split": {"type": "int", "low": 2, "high": 12},
        "model__min_samples_leaf": {"type": "int", "low": 1, "high": 8},
        "model__max_features": {"type": "categorical", "choices": ["sqrt", "log2"]},
    },
    "gradient_boosting_clf": {
        "model__n_estimators": {"type": "int", "low": 80, "high": 300},
        "model__learning_rate": {"type": "float", "low": 0.01, "high": 0.3, "log": True},
        "model__max_depth": {"type": "int", "low": 2, "high": 5},
        "model__subsample": {"type": "float", "low": 0.6, "high": 1.0},
    },
    "adaboost_clf": {
        "model__n_estimators": {"type": "int", "low": 50, "high": 300},
        "model__learning_rate": {"type": "float", "low": 0.01, "high": 1.0, "log": True},
    },
    "svc": {
        "model__kernel": {"type": "categorical", "choices": ["rbf", "linear", "poly"]},
        "model__C": {"type": "float", "low": 1e-2, "high": 1e2, "log": True},
        "model__gamma": {"type": "categorical", "choices": ["scale", "auto"]},
    },
    "knn_clf": {
        "model__n_neighbors": {"type": "int", "low": 3, "high": 30},
        "model__weights": {"type": "categorical", "choices": ["uniform", "distance"]},
        "model__metric": {
            "type": "categorical",
            "choices": ["euclidean", "manhattan", "minkowski"],
        },
    },
    "naive_bayes": {
        "model__var_smoothing": {"type": "float", "low": 1e-11, "high": 1e-7, "log": True},
    },
    # Regression
    "ridge": {"model__alpha": {"type": "float", "low": 1e-3, "high": 1e2, "log": True}},
    "lasso": {"model__alpha": {"type": "float", "low": 1e-3, "high": 1e1, "log": True}},
    "elastic_net": {
        "model__alpha": {"type": "float", "low": 1e-3, "high": 1e1, "log": True},
        "model__l1_ratio": {"type": "float", "low": 0.1, "high": 0.9},
    },
    "decision_tree_reg": {
        "model__criterion": {
            "type": "categorical",
            "choices": ["squared_error", "friedman_mse", "absolute_error"],
        },
        "model__splitter": {"type": "categorical", "choices": ["best", "random"]},
        "model__max_depth": {"type": "int", "low": 2, "high": 24},
        "model__min_samples_split": {"type": "int", "low": 2, "high": 20},
        "model__min_samples_leaf": {"type": "int", "low": 1, "high": 10},
    },
    "random_forest_reg": {
        "model__n_estimators": {"type": "int", "low": 100, "high": 400},
        "model__max_depth": {"type": "int", "low": 3, "high": 24},
        "model__min_samples_split": {"type": "int", "low": 2, "high": 12},
        "model__min_samples_leaf": {"type": "int", "low": 1, "high": 8},
        "model__max_features": {"type": "categorical", "choices": ["sqrt", "log2"]},
    },
    "extra_trees_reg": {
        "model__n_estimators": {"type": "int", "low": 100, "high": 400},
        "model__max_depth": {"type": "int", "low": 3, "high": 24},
        "model__min_samples_split": {"type": "int", "low": 2, "high": 12},
        "model__min_samples_leaf": {"type": "int", "low": 1, "high": 8},
        "model__max_features": {"type": "categorical", "choices": ["sqrt", "log2"]},
    },
    "gradient_boosting_reg": {
        "model__n_estimators": {"type": "int", "low": 80, "high": 300},
        "model__learning_rate": {"type": "float", "low": 0.01, "high": 0.3, "log": True},
        "model__max_depth": {"type": "int", "low": 2, "high": 5},
        "model__subsample": {"type": "float", "low": 0.6, "high": 1.0},
    },
    "adaboost_reg": {
        "model__n_estimators": {"type": "int", "low": 50, "high": 300},
        "model__learning_rate": {"type": "float", "low": 0.01, "high": 1.0, "log": True},
    },
    "svr": {
        "model__kernel": {"type": "categorical", "choices": ["rbf", "linear", "poly"]},
        "model__C": {"type": "float", "low": 1e-2, "high": 1e2, "log": True},
        "model__gamma": {"type": "categorical", "choices": ["scale", "auto"]},
    },
    "knn_reg": {
        "model__n_neighbors": {"type": "int", "low": 3, "high": 30},
        "model__weights": {"type": "categorical", "choices": ["uniform", "distance"]},
        "model__metric": {
            "type": "categorical",
            "choices": ["euclidean", "manhattan", "minkowski"],
        },
    },
    # Optional boosting plugins (applied only if the model is registered).
    "xgboost_clf": {
        "model__n_estimators": {"type": "int", "low": 100, "high": 400},
        "model__learning_rate": {"type": "float", "low": 0.01, "high": 0.3, "log": True},
        "model__max_depth": {"type": "int", "low": 2, "high": 8},
        "model__subsample": {"type": "float", "low": 0.6, "high": 1.0},
        "model__colsample_bytree": {"type": "float", "low": 0.6, "high": 1.0},
    },
    "xgboost_reg": {
        "model__n_estimators": {"type": "int", "low": 100, "high": 400},
        "model__learning_rate": {"type": "float", "low": 0.01, "high": 0.3, "log": True},
        "model__max_depth": {"type": "int", "low": 2, "high": 8},
        "model__subsample": {"type": "float", "low": 0.6, "high": 1.0},
        "model__colsample_bytree": {"type": "float", "low": 0.6, "high": 1.0},
    },
    "lightgbm_clf": {
        "model__n_estimators": {"type": "int", "low": 100, "high": 400},
        "model__learning_rate": {"type": "float", "low": 0.01, "high": 0.3, "log": True},
        "model__num_leaves": {"type": "int", "low": 15, "high": 127},
        "model__subsample": {"type": "float", "low": 0.6, "high": 1.0},
    },
    "lightgbm_reg": {
        "model__n_estimators": {"type": "int", "low": 100, "high": 400},
        "model__learning_rate": {"type": "float", "low": 0.01, "high": 0.3, "log": True},
        "model__num_leaves": {"type": "int", "low": 15, "high": 127},
        "model__subsample": {"type": "float", "low": 0.6, "high": 1.0},
    },
    "catboost_clf": {
        "model__iterations": {"type": "int", "low": 100, "high": 400},
        "model__learning_rate": {"type": "float", "low": 0.01, "high": 0.3, "log": True},
        "model__depth": {"type": "int", "low": 3, "high": 8},
    },
    "catboost_reg": {
        "model__iterations": {"type": "int", "low": 100, "high": 400},
        "model__learning_rate": {"type": "float", "low": 0.01, "high": 0.3, "log": True},
        "model__depth": {"type": "int", "low": 3, "high": 8},
    },
}


def _apply_search_spaces() -> None:
    """Attach search spaces to registered specs (skips unregistered plugins)."""
    for key, space in _SEARCH_SPACES.items():
        spec = _REGISTRY.get(key)
        if spec is not None:
            spec.search_space = space


_register_sklearn_baseline()
_register_optional()
_apply_search_spaces()
