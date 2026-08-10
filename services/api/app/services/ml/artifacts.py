"""Model artifact persistence and single-row inference for the Playground.

The winning fitted pipeline is serialised with joblib and stored through the
platform storage backend (local or S3). A JSON-safe *input schema* captured at
training time drives the Playground's dynamic form and supplies sensible
defaults (median / mode) for any inputs the user leaves blank.
"""
from __future__ import annotations

import io
from typing import Any

import numpy as np
import pandas as pd

from app.services.data.profiling import _py
from app.services.storage import get_storage

_MAX_CHOICES = 20


def artifact_key(workspace_id: str, run_id: str) -> str:
    return f"workspaces/{workspace_id}/models/{run_id}.joblib"


def save_artifact(pipe: Any, run_id: str, workspace_id: str) -> str:
    """Serialise the fitted pipeline to storage; returns the storage key."""
    import joblib

    buf = io.BytesIO()
    joblib.dump(pipe, buf, compress=3)
    key = artifact_key(workspace_id, run_id)
    get_storage().put(key, buf.getvalue())
    return key


def load_artifact(key: str) -> Any:
    """Load a previously stored pipeline. Raises FileNotFoundError if absent."""
    import joblib

    raw = get_storage().get(key)
    return joblib.load(io.BytesIO(raw))


def build_input_schema(
    X: pd.DataFrame, numeric: list[str], categorical: list[str]
) -> list[dict[str, Any]]:
    """Per-feature form spec: ranges for numerics, choices for categoricals."""
    schema: list[dict[str, Any]] = []
    for col in numeric:
        series = pd.to_numeric(X[col], errors="coerce").dropna()
        entry: dict[str, Any] = {"name": col, "kind": "numeric"}
        if len(series):
            entry["min"] = _py(round(float(series.min()), 4))
            entry["max"] = _py(round(float(series.max()), 4))
            entry["median"] = _py(round(float(series.median()), 4))
        schema.append(entry)
    for col in categorical:
        series = X[col].dropna().astype(str)
        counts = series.value_counts()
        choices = [str(v) for v in counts.index[:_MAX_CHOICES]]
        schema.append(
            {
                "name": col,
                "kind": "categorical",
                "choices": choices,
                "mode": choices[0] if choices else None,
            }
        )
    return schema


def predict_with_artifact(
    pipe: Any,
    input_schema: list[dict[str, Any]],
    inputs: dict[str, Any],
    task: str,
    classes: list[str] | None = None,
) -> dict[str, Any]:
    """Run one prediction from user-supplied inputs (blanks -> median/mode)."""
    row: dict[str, Any] = {}
    for field in input_schema:
        name = field["name"]
        value = inputs.get(name)
        if field["kind"] == "numeric":
            if value is None or value == "":
                value = field.get("median", 0)
            try:
                value = float(value)
            except (TypeError, ValueError):
                value = field.get("median", 0)
        else:
            if value is None or value == "":
                value = field.get("mode")
            value = None if value is None else str(value)
        row[name] = value

    frame = pd.DataFrame([row])
    prediction = pipe.predict(frame)[0]

    out: dict[str, Any] = {
        "prediction": _py(prediction) if not isinstance(prediction, str) else prediction,
        "probabilities": None,
        "confidence": None,
        "inputs_used": {k: _py(v) if not isinstance(v, str) else v for k, v in row.items()},
    }

    if task in ("classification", "semi_supervised") and hasattr(pipe, "predict_proba"):
        try:
            proba = np.asarray(pipe.predict_proba(frame))[0]
            labels = classes or [str(c) for c in getattr(pipe, "classes_", [])]
            if len(labels) != len(proba):
                labels = [str(i) for i in range(len(proba))]
            out["probabilities"] = {
                str(label): round(float(p), 4) for label, p in zip(labels, proba)
            }
            out["confidence"] = round(float(proba.max()), 4)
        except Exception:  # noqa: BLE001 - probabilities are best-effort
            pass
    return out
