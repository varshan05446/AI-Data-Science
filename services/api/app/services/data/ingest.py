"""Ingestion: turn raw uploaded bytes into a pandas DataFrame.

CSV / Excel / JSON are fully implemented. The remaining sources listed in the
product spec (Postgres/MySQL/Mongo/Google Sheets/generic API) are defined as
connector stubs with a stable interface for later phases.
"""
from __future__ import annotations

import io

import pandas as pd

SUPPORTED_UPLOAD_TYPES = {"csv", "excel", "json"}
# Connector-based sources implemented behind the same conceptual interface later.
PLANNED_CONNECTOR_TYPES = {"sql", "postgresql", "mysql", "mongodb", "google_sheets", "api"}


class IngestionError(ValueError):
    """Raised when a file cannot be parsed into a tabular DataFrame."""


def detect_source_type(filename: str, content_type: str = "") -> str:
    name = (filename or "").lower()
    if name.endswith(".csv") or "csv" in content_type:
        return "csv"
    if name.endswith((".xlsx", ".xls", ".xlsx")) or "spreadsheet" in content_type:
        return "excel"
    if name.endswith(".json") or "json" in content_type:
        return "json"
    return "csv"


def load_dataframe(data: bytes, source_type: str) -> pd.DataFrame:
    """Parse raw bytes into a DataFrame based on ``source_type``."""
    source_type = source_type.lower()
    try:
        if source_type == "csv":
            df = pd.read_csv(io.BytesIO(data))
        elif source_type == "excel":
            df = pd.read_excel(io.BytesIO(data))
        elif source_type == "json":
            df = _read_json(data)
        else:
            raise IngestionError(
                f"Source type '{source_type}' is not yet supported for direct upload."
            )
    except IngestionError:
        raise
    except Exception as exc:  # noqa: BLE001 - surface a clean parse error
        raise IngestionError(f"Could not parse file as {source_type}: {exc}") from exc

    if df.empty:
        raise IngestionError("The uploaded file contains no rows.")
    # Normalise column names to strings and strip whitespace.
    df.columns = [str(c).strip() for c in df.columns]
    return df


def _read_json(data: bytes) -> pd.DataFrame:
    import json

    parsed = json.loads(data.decode("utf-8"))
    if isinstance(parsed, list):
        return pd.json_normalize(parsed)
    if isinstance(parsed, dict):
        # Common shapes: {"data": [...]} or a dict of columns.
        for key in ("data", "records", "rows", "items"):
            if key in parsed and isinstance(parsed[key], list):
                return pd.json_normalize(parsed[key])
        return pd.json_normalize(parsed)
    raise IngestionError("Unsupported JSON structure.")
