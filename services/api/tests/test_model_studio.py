"""Model Studio redesign: objectives, leakage detection, artifact + playground."""
from __future__ import annotations

import io
import uuid

import numpy as np
import pandas as pd


def _auth_headers(client) -> dict:
    email = f"user-{uuid.uuid4().hex[:8]}@test.io"
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123", "name": "Tester"},
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _churn_frame(rows: int = 120) -> pd.DataFrame:
    rng = np.random.default_rng(7)
    tenure = rng.integers(1, 72, rows)
    charges = rng.uniform(20, 120, rows).round(2)
    contract = rng.choice(["monthly", "yearly"], rows)
    churn = ((tenure < 12) & (contract == "monthly")).astype(int)
    return pd.DataFrame(
        {
            "customer_id": [f"C{i:05d}" for i in range(rows)],
            "tenure": tenure,
            "monthly_charges": charges,
            "contract": contract,
            "churn": churn,
        }
    )


def _upload(client, headers, df: pd.DataFrame) -> str:
    pid = client.post(
        "/api/v1/projects", json={"name": "ML Studio"}, headers=headers
    ).json()["id"]
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    resp = client.post(
        f"/api/v1/projects/{pid}/datasets",
        files={"file": ("churn.csv", buf.getvalue().encode(), "text/csv")},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_objectives_from_churn_profile():
    from app.services.data.profiling import profile_dataframe
    from app.services.ml.objectives import build_objectives, dataset_ml_summary

    report = profile_dataframe(_churn_frame())
    objectives = build_objectives(report)

    assert objectives, "expected at least one objective"
    churn = next(o for o in objectives if o["target"] == "churn")
    assert churn["title"] == "Predict Customer Churn"
    assert churn["task"] == "classification"
    assert churn["business_value"] == "high"
    assert churn["difficulty"] in ("easy", "medium", "hard")
    assert 0 <= churn["data_quality"] <= 100
    assert any(o["recommended"] for o in objectives)
    # The id column must never be offered as an objective.
    assert all(o["target"] != "customer_id" for o in objectives)

    summary = dataset_ml_summary(report)
    assert summary["rows"] == 120
    assert "quality_score" in summary and "issues" in summary


def test_leakage_column_removed():
    from app.services.ml.automl import train_and_evaluate

    df = _churn_frame()
    # A categorical column that is a 1:1 copy of the target -> pure leakage.
    df["churn_flag"] = df["churn"].map({0: "no", 1: "yes"})

    result = train_and_evaluate(df, "churn", task="classification")
    removed = [r["feature"] for r in result["leakage"]["removed"]]
    assert "churn_flag" in removed
    assert "churn_flag" not in result["features"]
    # The new report fields exist alongside the classic contract.
    assert result["input_schema"]
    assert 0 <= result["best"]["confidence"] <= 1
    assert "business_summary" in result["advisor"]


def test_train_persists_artifact_and_playground_predicts(client):
    headers = _auth_headers(client)
    dataset_id = _upload(client, headers, _churn_frame())

    # Config now carries objectives + dataset summary for the Analyze step.
    resp = client.get(f"/api/v1/datasets/{dataset_id}/models/config", headers=headers)
    assert resp.status_code == 200, resp.text
    config = resp.json()
    assert any(o["title"] == "Predict Customer Churn" for o in config["objectives"])
    assert config["summary"]["rows"] == 120

    # One-click train (beginner flow) persists the winning pipeline artifact.
    resp = client.post(
        f"/api/v1/datasets/{dataset_id}/models/train",
        json={"target": "churn", "objective_id": "obj_churn"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    run = resp.json()
    assert run["result"].get("artifact_key"), "artifact should be persisted"
    assert run["result"]["objective_id"] == "obj_churn"
    assert run["result"]["input_schema"]

    # Playground: predict with explicit inputs.
    resp = client.post(
        f"/api/v1/datasets/{dataset_id}/models/runs/{run['id']}/predict",
        json={"inputs": {"tenure": 3, "monthly_charges": 95.0, "contract": "monthly"}},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    pred = resp.json()
    assert pred["prediction"] is not None
    assert pred["explanation"]
    if pred["probabilities"] is not None:
        assert abs(sum(pred["probabilities"].values()) - 1.0) < 0.05
        assert pred["confidence"] is not None

    # Blank inputs fall back to median/mode defaults instead of failing.
    resp = client.post(
        f"/api/v1/datasets/{dataset_id}/models/runs/{run['id']}/predict",
        json={"inputs": {}},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text


def test_scan_target_signals_ranks_and_flags_derived_leak():
    from app.services.ml.discovery import scan_target_signals

    df = _churn_frame()
    # A tautology the linear leakage detector (|corr| >= 0.995) misses: the exact
    # product of two other columns. The scan must flag it as a derived-column leak.
    df["annual_value"] = df["tenure"] * df["monthly_charges"]

    entries = scan_target_signals(df)

    by_target = {e["target"]: e for e in entries}
    assert "churn" in by_target
    assert "annual_value" in by_target

    # The planted tautology is flagged with its driving expression.
    leak = by_target["annual_value"]
    assert leak["leaky"] is True
    assert "tenure" in leak["driver"]
    assert "monthly_charges" in leak["driver"]
    assert leak["note"] and "tautology" in leak["note"]

    # The genuine learnable target stays a "real signal".
    assert by_target["churn"]["leaky"] is False

    # Best-first ordering by achievable score (no per-target errors here).
    scores = [e["test_score"] for e in entries]
    assert scores == sorted(scores, reverse=True)


def test_signal_scan_endpoint(client):
    headers = _auth_headers(client)
    dataset_id = _upload(client, headers, _churn_frame())

    resp = client.get(
        f"/api/v1/datasets/{dataset_id}/models/signal-scan", headers=headers
    )
    assert resp.status_code == 200, resp.text
    entries = resp.json()
    assert isinstance(entries, list) and entries
    by_target = {e["target"]: e for e in entries}
    assert "churn" in by_target
    # JSON-safe shape with the fields the UI table renders.
    for entry in entries:
        assert {"target", "task", "primary_metric", "test_score", "best_model", "leaky"} <= set(entry)
    # The probable-id column is never offered as a target.
    assert all(e["target"] != "customer_id" for e in entries)
