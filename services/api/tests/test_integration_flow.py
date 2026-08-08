"""Happy-path integration test: the full core flow with the mock AI provider."""
from __future__ import annotations

import io
import uuid

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


def _sample_csv() -> bytes:
    df = pd.DataFrame(
        {
            "region": ["N", "S", "E", "W"] * 10,
            "revenue": [100, 80, 120, 110] * 10,
            "units": [2, 1, 3, 2] * 10,
            "churn": [0, 1, 0, 0] * 10,
        }
    )
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return buf.getvalue().encode()


def test_full_flow(client):
    headers = _auth_headers(client)

    # Create project
    resp = client.post(
        "/api/v1/projects", json={"name": "Test Project"}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    project_id = resp.json()["id"]

    # Upload dataset (profiled synchronously)
    resp = client.post(
        f"/api/v1/projects/{project_id}/datasets",
        files={"file": ("sales.csv", _sample_csv(), "text/csv")},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    dataset = resp.json()
    dataset_id = dataset["id"]
    assert dataset["status"] == "ready"
    assert dataset["row_count"] == 40

    # Profile
    resp = client.get(f"/api/v1/datasets/{dataset_id}/profile", headers=headers)
    assert resp.status_code == 200
    report = resp.json()["report"]
    assert report["dataset_summary"]["columns"] == 4
    assert "quality" in report

    # EDA (each chart carries an AI explanation)
    resp = client.get(f"/api/v1/datasets/{dataset_id}/eda", headers=headers)
    assert resp.status_code == 200
    charts = resp.json()["charts"]
    assert len(charts) > 0
    assert all("ai_explanation" in c for c in charts)

    # Insights
    resp = client.get(f"/api/v1/datasets/{dataset_id}/insights", headers=headers)
    assert resp.status_code == 200
    insights = resp.json()["insights"]
    assert len(insights) > 0
    assert {"title", "confidence", "recommendation"} <= set(insights[0].keys())

    # Chat
    resp = client.post(
        f"/api/v1/datasets/{dataset_id}/chat",
        json={"message": "Why did revenue drop?"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["message"]["role"] == "assistant"
    assert len(resp.json()["message"]["content"]) > 0


def test_requires_authentication(client):
    resp = client.get("/api/v1/projects")
    assert resp.status_code in (401, 403)


def test_workspace_isolation(client):
    # User A creates a project; user B must not see or fetch it.
    headers_a = _auth_headers(client)
    headers_b = _auth_headers(client)
    pid = client.post(
        "/api/v1/projects", json={"name": "A only"}, headers=headers_a
    ).json()["id"]

    resp = client.get(f"/api/v1/projects/{pid}", headers=headers_b)
    assert resp.status_code == 404

    listing = client.get("/api/v1/projects", headers=headers_b).json()
    assert all(p["id"] != pid for p in listing)
