"""Tests for the two-assistant AI architecture.

Covers the strict boundary between the AI Copilot (product guide, zero data
access) and the Data Scientist AI (dataset-scoped expert), plus conversation
memory and dataset isolation.
"""
from __future__ import annotations

import io
import uuid

import numpy as np
import pandas as pd

from app.services.ai import get_llm, product_kb
from app.services.ai.agents import expert_answer
from app.services.ai.copilot_mock import CopilotMockProvider
from app.services.ai.base import ChatTurn
from app.services.ai.nlp import understand
from app.services.data.profiling import profile_dataframe


# --- Fixtures -----------------------------------------------------------------


def _sample() -> pd.DataFrame:
    rng = np.random.default_rng(3)
    n = 120
    return pd.DataFrame(
        {
            "Product": rng.choice(list("ABCD"), n),
            "Region": rng.choice(["North", "South", "East", "West"], n),
            "Revenue": rng.integers(10, 900, n),
            "Cost": rng.integers(5, 400, n),
        }
    )


def _profile() -> dict:
    return profile_dataframe(_sample())


# --- Shared product knowledge base -------------------------------------------


def test_product_kb_is_accurate_to_the_real_ui():
    m = product_kb.APP_MAP
    assert "8 TABS" in m
    for tab in ("Data Profile", "Data Cleaning", "Explore", "Model Studio",
                "AI Insights", "Notebook", "Reports", "Chat"):
        assert tab in m
    # The old stale claim of "10 tabs" must be gone.
    assert "10 tabs" not in m and "10 TABS" not in m


def test_app_help_router_answers_navigation():
    assert "Model Studio" in (product_kb.answer_app_help("how do I train a model") or "")
    assert "Data Cleaning" in (product_kb.answer_app_help("where is data cleaning") or "")
    assert product_kb.answer_app_help("what is the revenue total") is None


def test_is_data_question_classifies_correctly():
    assert product_kb.is_data_question("which column has missing values")
    assert product_kb.is_data_question("why is my accuracy low")
    assert product_kb.is_data_question("build me a model")
    assert not product_kb.is_data_question("how do I upload a dataset")
    assert not product_kb.is_data_question("where is the notebook")


# --- AI Copilot (product guide, no data access) ------------------------------


def test_copilot_answers_product_questions():
    provider = CopilotMockProvider()
    reply = provider.complete([ChatTurn(role="user", content="how do I upload a dataset")])
    assert "Upload dataset" in reply
    assert "Projects" in reply


def test_copilot_hands_off_data_questions_and_never_guesses():
    provider = CopilotMockProvider()
    reply = provider.complete(
        [ChatTurn(role="user", content="which column has the most missing values?")]
    )
    assert "Data Scientist AI" in reply
    # It must not fabricate an answer about the data.
    assert "column" not in reply.lower() or "outside my scope" in reply.lower()


def test_copilot_endpoint_sets_handoff_flag(client):
    headers = _auth_headers(client)
    # Product question -> no handoff.
    r1 = client.post(
        "/api/v1/copilot/chat",
        json={"message": "How do I train a model?", "history": []},
        headers=headers,
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["handoff"] is False
    assert len(r1.json()["reply"]) > 0

    # Data question -> handoff to the Data Scientist AI.
    r2 = client.post(
        "/api/v1/copilot/chat",
        json={"message": "Which column in my dataset has missing values?", "history": []},
        headers=headers,
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["handoff"] is True


# --- Data Scientist AI also knows the UI -------------------------------------


def test_data_scientist_ai_answers_navigation_questions():
    df, prof = _sample(), _profile()
    content, payload = expert_answer(get_llm(), prof, df, [], "where is Model Studio?")
    assert payload["understanding"]["intent"] == "app_help"
    assert "Model Studio" in content


def test_data_scientist_ai_still_computes_data_answers():
    df, prof = _sample(), _profile()
    content, payload = expert_answer(get_llm(), prof, df, [], "show top products by revenue")
    assert payload["chart"]["type"] == "bar"


# --- Conversation memory (pronoun resolution) --------------------------------


def test_conversation_memory_resolves_them_to_prior_subject():
    prof = _profile()
    history = [
        {"role": "user", "content": "which columns have missing values"},
        {"role": "assistant", "content": "Here are the missing values..."},
    ]
    u = understand("should I remove them?", prof, history)
    assert u.followup is True
    assert u.reference and "missing" in u.reference.lower()
    # "them" inherits the previous data topic.
    assert u.intent == "missing"


def test_conversation_memory_resolves_it_to_prior_model():
    prof = _profile()
    history = [
        {"role": "user", "content": "build a random forest model"},
        {"role": "assistant", "content": "Trained a random forest..."},
    ]
    u = understand("can you improve it?", prof, history)
    assert u.followup is True
    assert u.reference and "random forest" in u.reference.lower()


def test_no_history_means_no_followup():
    u = understand("should I remove them?", _profile(), None)
    assert u.followup is False


# --- Dataset isolation --------------------------------------------------------


def test_chat_history_is_isolated_per_dataset(client):
    headers = _auth_headers(client)
    project_id = client.post(
        "/api/v1/projects", json={"name": "Isolation"}, headers=headers
    ).json()["id"]

    ds_a = _upload(client, headers, project_id, "a.csv")
    ds_b = _upload(client, headers, project_id, "b.csv")

    # Chat only on dataset A.
    client.post(
        f"/api/v1/datasets/{ds_a}/chat",
        json={"message": "summarise this dataset"},
        headers=headers,
    )

    # Dataset B must have no memory of that conversation.
    msgs_b = client.get(f"/api/v1/datasets/{ds_b}/chat/messages", headers=headers).json()
    assert msgs_b == []

    # Dataset A has its own history.
    msgs_a = client.get(f"/api/v1/datasets/{ds_a}/chat/messages", headers=headers).json()
    assert len(msgs_a) >= 2  # user + assistant


# --- Helpers ------------------------------------------------------------------


def _auth_headers(client) -> dict:
    email = f"user-{uuid.uuid4().hex[:8]}@test.io"
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123", "name": "Tester"},
    )
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _upload(client, headers, project_id: str, name: str) -> str:
    df = pd.DataFrame({"region": ["N", "S"] * 20, "revenue": list(range(40))})
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    resp = client.post(
        f"/api/v1/projects/{project_id}/datasets",
        files={"file": (name, buf.getvalue().encode(), "text/csv")},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]
