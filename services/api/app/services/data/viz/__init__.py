"""Interactive visualization engine for the Explore module.

`catalog` describes every chart type (grouped by category) with its required and
optional encodings, so the frontend can render adaptive customization controls.
`builder` turns a user-chosen chart type + column encodings + style options into
either a tidy Plotly spec (rendered client-side) or a base64 image produced by
Matplotlib/Seaborn (statistical/publication charts).
"""
from app.services.data.viz.builder import build_chart
from app.services.data.viz.catalog import (
    PALETTES,
    THEMES,
    catalog_for_dataframe,
    column_metadata,
)

__all__ = [
    "build_chart",
    "catalog_for_dataframe",
    "column_metadata",
    "PALETTES",
    "THEMES",
]
