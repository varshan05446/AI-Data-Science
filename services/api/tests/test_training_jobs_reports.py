"""Background training jobs + professional reporting center."""
from __future__ import annotations

import io
import time
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
    rng = np.random.default_rng(11)
    tenure = rng.integers(1, 72, rows)
    charges = rng.uniform(20, 120, rows).round(2)
    contract = rng.choice(["monthly", "yearly"], rows)
    churn = ((tenure < 12) & (contract == "monthly")).astype(int)
    return pd.DataFrame(
        {
            "tenure": tenure,
            "monthly_charges": charges,
            "contract": contract,
            "churn": churn,
        }
    )


def _upload(client, headers, df: pd.DataFrame) -> str:
    pid = client.post(
        "/api/v1/projects", json={"name": "Jobs & Reports"}, headers=headers
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


def _wait_for_job(client, headers, dataset_id: str, job_id: str, timeout: float = 120.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        resp = client.get(
            f"/api/v1/datasets/{dataset_id}/models/jobs/{job_id}", headers=headers
        )
        assert resp.status_code == 200, resp.text
        job = resp.json()
        if job["status"] in ("succeeded", "failed"):
            return job
        time.sleep(0.5)
    raise AssertionError(f"job {job_id} did not finish within {timeout}s")


def test_async_training_job_lifecycle_and_cache():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        headers = _auth_headers(client)
        ds = _upload(client, headers, _churn_frame())

        body = {
            "target": "churn",
            "tune": False,
            "model_keys": ["logistic_regression", "decision_tree_clf"],
        }
        resp = client.post(
            f"/api/v1/datasets/{ds}/models/train-async", json=body, headers=headers
        )
        assert resp.status_code == 202, resp.text
        job = resp.json()
        assert job["status"] in ("queued", "running")
        assert job["dataset_id"] == ds

        done = _wait_for_job(client, headers, ds, job["id"])
        assert done["status"] == "succeeded", done.get("error")
        assert done["progress"] == 100.0
        assert done["model_run_id"]
        assert done["logs"], "job should stream progress logs"
        stages = {entry["stage"] for entry in done["logs"]}
        assert "train" in stages

        # The finished run is a normal ModelRun usable by existing endpoints.
        run = client.get(
            f"/api/v1/datasets/{ds}/models/runs/{done['model_run_id']}", headers=headers
        )
        assert run.status_code == 200, run.text
        assert run.json()["task"] == "classification"

        # Same config again -> cached job returned, no retraining.
        resp2 = client.post(
            f"/api/v1/datasets/{ds}/models/train-async", json=body, headers=headers
        )
        assert resp2.status_code == 202
        assert resp2.json()["id"] == job["id"]
        assert resp2.json()["status"] == "succeeded"

        # force=true -> a brand-new job.
        resp3 = client.post(
            f"/api/v1/datasets/{ds}/models/train-async",
            json={**body, "force": True},
            headers=headers,
        )
        assert resp3.status_code == 202
        assert resp3.json()["id"] != job["id"]
        forced = _wait_for_job(client, headers, ds, resp3.json()["id"])
        assert forced["status"] == "succeeded", forced.get("error")

        # Job list endpoint includes both jobs.
        jobs = client.get(f"/api/v1/datasets/{ds}/models/jobs", headers=headers)
        assert jobs.status_code == 200
        assert len(jobs.json()) >= 2


def test_report_center_documents_and_exports(client):
    headers = _auth_headers(client)
    ds = _upload(client, headers, _churn_frame())
    # Ensure the profile exists (report builders read it).
    assert client.get(f"/api/v1/datasets/{ds}/profile", headers=headers).status_code == 200

    # Reporting-center metadata.
    center = client.get(f"/api/v1/datasets/{ds}/reports", headers=headers)
    assert center.status_code == 200, center.text
    meta = center.json()
    assert [t["type"] for t in meta["types"]] == [
        "executive",
        "data_analysis",
        "model",
        "ai_insight",
    ]
    assert meta["formats"]["markdown"] and meta["formats"]["html"]

    # Structured documents for every professional type.
    for rtype in ("executive", "data_analysis", "model", "ai_insight"):
        doc = client.get(
            f"/api/v1/datasets/{ds}/reports/{rtype}/document", headers=headers
        )
        assert doc.status_code == 200, doc.text
        payload = doc.json()
        assert payload["sections"], rtype
        assert payload["title"]

    # Exports: markdown/html always work; binary formats when libs installed.
    magic = {"pdf": b"%PDF", "docx": b"PK", "pptx": b"PK"}
    for fmt in ("markdown", "html", "pdf", "docx", "pptx"):
        resp = client.get(
            f"/api/v1/datasets/{ds}/reports/executive/export?format={fmt}",
            headers=headers,
        )
        if fmt in magic and not meta["formats"].get(fmt):
            assert resp.status_code == 503
            continue
        assert resp.status_code == 200, f"{fmt}: {resp.text[:200]}"
        assert "attachment" in resp.headers.get("content-disposition", "")
        if fmt in magic:
            assert resp.content.startswith(magic[fmt]), fmt

    # Legacy report endpoints keep working.
    for legacy in ("executive", "business", "technical"):
        resp = client.get(f"/api/v1/datasets/{ds}/reports/{legacy}", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["content"]
    # The upgraded executive markdown is the professional document render.
    exec_md = client.get(f"/api/v1/datasets/{ds}/reports/executive", headers=headers)
    assert "Table of Contents" in exec_md.json()["content"]
