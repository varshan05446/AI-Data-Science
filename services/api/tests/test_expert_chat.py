"""Unit tests for the dataset-grounded expert chat (NLP + analyst)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.services.ai import get_llm
from app.services.ai.agents import expert_answer
from app.services.ai.nlp import correct_spelling, understand
from app.services.data.profiling import profile_dataframe


def _sample() -> pd.DataFrame:
    rng = np.random.default_rng(7)
    n = 200
    return pd.DataFrame(
        {
            "Product": rng.choice(list("ABCD"), n),
            "Region": rng.choice(["North", "South", "East", "West"], n),
            "Revenue": rng.integers(10, 900, n),
            "Cost": rng.integers(5, 400, n),
            "Date": pd.date_range("2023-01-01", periods=n, freq="D"),
        }
    )


def _profile() -> dict:
    return profile_dataframe(_sample())


# --- NLP ----------------------------------------------------------------------


def test_spelling_correction_maps_to_columns_and_vocab():
    _, corrections = correct_spelling("show top prodcuts by revnue", ["Product", "Revenue"])
    mapped = {c["from"].lower(): c["to"] for c in corrections}
    assert mapped.get("prodcuts") in {"product", "products"}
    assert mapped.get("revnue") in {"revenue", "revenues"}


def test_intent_detection_natural_language():
    prof = _profile()
    assert understand("best selling items", prof).intent == "top_n"
    assert understand("what is the average revenue", prof).intent == "aggregate"
    assert understand("which columns have missing values", prof).intent == "missing"
    assert understand("show correlation between revenue and cost", prof).intent == "correlation"
    assert understand("generate SQL to summarise by region", prof).intent == "sql"
    assert understand("why is my accuracy low", prof).intent == "diagnose"


def test_entity_resolution_picks_metric_and_group():
    u = understand("highest revenue by region", _profile())
    assert u.metric == "Revenue"
    assert u.group_by == "Region"


# --- Analyst (computed answers) ----------------------------------------------


def test_top_n_computes_real_ranking_with_chart_and_table():
    df, prof = _sample(), _profile()
    content, payload = expert_answer(get_llm(), prof, df, [], "show top products by revenue")
    assert payload["chart"]["type"] == "bar"
    assert payload["table"]["columns"][0] == "Product"
    assert "What I found" in content


def test_missing_answer_reports_no_missing_when_clean():
    df, prof = _sample(), _profile()
    content, _ = expert_answer(get_llm(), prof, df, [], "any missing values?")
    assert "no missing values" in content.lower()


def test_correlation_answer_returns_pairs_table():
    df, prof = _sample(), _profile()
    _, payload = expert_answer(get_llm(), prof, df, [], "correlation between revenue and cost")
    assert payload["table"]["columns"] == ["feature a", "feature b", "correlation"]


def test_sql_generation_includes_group_by():
    df, prof = _sample(), _profile()
    _, payload = expert_answer(get_llm(), prof, df, [], "generate sql grouped by region")
    assert payload["code"]["language"] == "sql"
    assert "GROUP BY" in payload["code"]["content"]


def test_typo_question_still_computes_and_reports_correction():
    df, prof = _sample(), _profile()
    content, payload = expert_answer(get_llm(), prof, df, [], "top prodcuts by revnue")
    assert payload["corrections"]
    assert payload["chart"]["type"] == "bar"


def test_general_question_falls_back_to_provider():
    df, prof = _sample(), _profile()
    content, payload = expert_answer(get_llm(), prof, df, [], "hello there")
    # Falls back to the LLM provider; still returns understanding metadata.
    assert "understanding" in payload
    assert isinstance(content, str) and content
