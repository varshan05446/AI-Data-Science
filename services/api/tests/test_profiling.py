"""Unit tests for the profiling engine."""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.services.data.profiling import profile_dataframe


def _sample() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "id": range(1, 11),
            "region": ["N", "S", "N", "E", "W", "S", "N", "E", "W", "S"],
            "revenue": [100, 200, None, 400, 500, 600, 700, 800, 900, 100000],
            "churn": [0, 1, 0, 0, 1, 0, 0, 0, 1, 0],
        }
    )


def test_dataset_summary_counts():
    report = profile_dataframe(_sample())
    summary = report["dataset_summary"]
    assert summary["rows"] == 10
    assert summary["columns"] == 4
    assert summary["total_missing_cells"] == 1


def test_missing_report_flags_revenue():
    report = profile_dataframe(_sample())
    cols = {c["name"]: c for c in report["columns"]}
    assert cols["revenue"]["missing"] == 1
    assert cols["revenue"]["missing_pct"] == 10.0


def test_outlier_detection_on_revenue():
    report = profile_dataframe(_sample())
    revenue = next(c for c in report["columns"] if c["name"] == "revenue")
    assert revenue["stats"]["outliers"] >= 1


def test_probable_id_detection():
    report = profile_dataframe(_sample())
    assert "id" in report["probable_primary_keys"]


def test_quality_score_bounds():
    report = profile_dataframe(_sample())
    q = report["quality"]
    assert 0 <= q["score"] <= 100
    assert q["grade"] in {"A", "B", "C", "D", "F"}


def test_json_safe_no_nan():
    # NaN must be normalised to None so the payload is JSON serialisable.
    report = profile_dataframe(_sample())
    revenue = next(c for c in report["columns"] if c["name"] == "revenue")
    for v in revenue["stats"].values():
        assert not (isinstance(v, float) and np.isnan(v))
