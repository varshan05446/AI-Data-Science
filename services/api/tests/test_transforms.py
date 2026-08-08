"""Unit tests for the data-cleaning transform engine and pipeline."""
from __future__ import annotations

import pandas as pd

from app.services.data.transforms import (
    TransformError,
    apply_operation,
    apply_pipeline,
    describe_step,
    grid_preview,
    operation_catalog,
)


def _sample() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "Product": ["a ", "B", "c", None, "B"],
            "Region": ["North", "South", "North", "East", "South"],
            "Revenue": [10.0, 20.0, None, 40.0, 20.0],
            "Date": ["2023-01-05", "2023-02-11", "2023-03-20", "2023-04-01", "2023-05-15"],
        }
    )


# --- Catalog ------------------------------------------------------------------


def test_operation_catalog_groups_present():
    groups = {g["group"] for g in operation_catalog()}
    assert {"Missing Values", "Duplicates", "Data Types", "Outliers"} <= groups


# --- Missing values -----------------------------------------------------------


def test_fill_missing_median():
    out = apply_operation(
        _sample(), {"op": "fill_missing", "column": "Revenue", "params": {"method": "median"}}
    )
    assert out["Revenue"].isna().sum() == 0
    assert out.loc[2, "Revenue"] == 20.0  # median of [10,20,40,20]


def test_drop_missing_rows_on_column():
    out = apply_operation(
        _sample(), {"op": "drop_missing_rows", "column": "Product", "params": {}}
    )
    assert out.shape[0] == 4
    assert out["Product"].isna().sum() == 0


def test_drop_column():
    out = apply_operation(_sample(), {"op": "drop_column", "column": "Date", "params": {}})
    assert "Date" not in out.columns


# --- Duplicates / types / strings --------------------------------------------


def test_drop_duplicates_keep_first():
    df = pd.DataFrame({"x": [1, 1, 2], "y": ["a", "a", "b"]})
    out = apply_operation(df, {"op": "drop_duplicates", "column": None, "params": {"keep": "first"}})
    assert out.shape[0] == 2


def test_convert_type_to_integer():
    df = pd.DataFrame({"n": ["1", "2", "x"]})
    out = apply_operation(df, {"op": "convert_type", "column": "n", "params": {"to": "integer"}})
    assert str(out["n"].dtype) == "Int64"
    assert pd.isna(out.loc[2, "n"])


def test_string_op_upper_and_trim_pipeline():
    steps = [
        {"op": "string_op", "column": "Product", "params": {"op": "trim"}},
        {"op": "string_op", "column": "Product", "params": {"op": "upper"}},
    ]
    out = apply_pipeline(_sample(), steps)
    assert out.loc[0, "Product"] == "A"


# --- Outliers / dates / feature engineering ----------------------------------


def test_handle_outliers_cap():
    df = pd.DataFrame({"v": [1, 2, 3, 4, 1000]})
    out = apply_operation(df, {"op": "handle_outliers", "column": "v", "params": {"method": "cap"}})
    assert out["v"].max() < 1000


def test_date_extract_year():
    out = apply_operation(_sample(), {"op": "date_extract", "column": "Date", "params": {"part": "year"}})
    assert "Date_year" in out.columns
    assert out["Date_year"].iloc[0] == 2023


def test_one_hot_encode_expands_columns():
    out = apply_operation(_sample(), {"op": "one_hot_encode", "column": "Region", "params": {}})
    assert "Region" not in out.columns
    assert any(c.startswith("Region_") for c in out.columns)


# --- Errors -------------------------------------------------------------------


def test_unknown_operation_raises():
    try:
        apply_operation(_sample(), {"op": "does_not_exist", "column": None, "params": {}})
    except TransformError:
        return
    raise AssertionError("Expected TransformError for unknown operation")


def test_missing_column_raises():
    try:
        apply_operation(_sample(), {"op": "drop_column", "column": "Nope", "params": {}})
    except TransformError:
        return
    raise AssertionError("Expected TransformError for missing column")


# --- Preview + describe -------------------------------------------------------


def test_grid_preview_shape_and_stats():
    grid = grid_preview(_sample())
    assert grid["shape"] == {"rows": 5, "columns": 4}
    assert grid["column_order"] == ["Product", "Region", "Revenue", "Date"]
    assert all("memory_bytes" in c for c in grid["columns"])
    assert isinstance(grid["duplicate_rows"], int)


def test_describe_step_is_human_readable():
    label = describe_step(
        {"op": "fill_missing", "column": "Revenue", "params": {"method": "median"}}
    )
    assert "Revenue" in label and "median" in label


def test_pipeline_is_reproducible():
    steps = [
        {"op": "fill_missing", "column": "Revenue", "params": {"method": "median"}},
        {"op": "drop_duplicates", "column": None, "params": {"keep": "first"}},
    ]
    a = apply_pipeline(_sample(), steps)
    b = apply_pipeline(_sample(), steps)
    assert a.equals(b)
