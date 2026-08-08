"""Helpers to read a stored dataset back into a DataFrame."""
from __future__ import annotations

import pandas as pd

from app.models import Dataset
from app.services.data.ingest import load_dataframe
from app.services.storage import get_storage


def read_dataset_dataframe(dataset: Dataset) -> pd.DataFrame:
    """Fetch the dataset's bytes from storage and parse into a DataFrame."""
    raw = get_storage().get(dataset.storage_key)
    return load_dataframe(raw, dataset.source_type)
