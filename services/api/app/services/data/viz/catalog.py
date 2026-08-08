"""Chart catalog + column metadata for the Explore module.

The catalog is static (chart capabilities never change), but we tag each chart's
encodings with whether the current dataset can satisfy them, and expose per-column
semantic types so the frontend can build adaptive dropdowns.
"""
from __future__ import annotations

from typing import Any

import pandas as pd

from app.services.data.profiling import _semantic_type

# --- Style tokens shared with the frontend -----------------------------------
# Named qualitative palettes (kept token-free and dark-mode friendly).
PALETTES: list[dict[str, Any]] = [
    {"id": "indigo", "label": "Indigo",
     "colors": ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#10b981", "#3b82f6"]},
    {"id": "ocean", "label": "Ocean",
     "colors": ["#0ea5e9", "#06b6d4", "#3b82f6", "#6366f1", "#0891b2", "#2563eb", "#0284c7", "#4f46e5"]},
    {"id": "sunset", "label": "Sunset",
     "colors": ["#f97316", "#ef4444", "#ec4899", "#f59e0b", "#e11d48", "#fb923c", "#db2777", "#facc15"]},
    {"id": "forest", "label": "Forest",
     "colors": ["#16a34a", "#10b981", "#84cc16", "#22c55e", "#059669", "#65a30d", "#15803d", "#4ade80"]},
    {"id": "berry", "label": "Berry",
     "colors": ["#8b5cf6", "#d946ef", "#ec4899", "#a855f7", "#c026d3", "#7c3aed", "#db2777", "#e879f9"]},
    {"id": "mono", "label": "Monochrome",
     "colors": ["#334155", "#475569", "#64748b", "#94a3b8", "#0f172a", "#1e293b", "#cbd5e1", "#7c8ba1"]},
]

# Continuous colorscales for heatmaps / density / numeric color mapping.
COLOR_SCALES: list[dict[str, str]] = [
    {"id": "RdBu", "label": "Red-Blue"},
    {"id": "Viridis", "label": "Viridis"},
    {"id": "Cividis", "label": "Cividis"},
    {"id": "Plasma", "label": "Plasma"},
    {"id": "Turbo", "label": "Turbo"},
    {"id": "Blues", "label": "Blues"},
]

# Base map themes (token-free tile layers) - consumed by Phase 2 Maps segment.
THEMES: list[dict[str, str]] = [
    {"id": "light", "label": "Light", "style": "carto-positron"},
    {"id": "dark", "label": "Dark", "style": "carto-darkmatter"},
    {"id": "street", "label": "Street", "style": "open-street-map"},
]

# Categories drive the gallery's grouping order (chart segment, then map segment).
CATEGORIES = ["Distribution", "Comparison", "Relationship", "Composition", "Time", "Statistical"]
MAP_CATEGORIES = ["Points", "Density", "Regions"]


def _enc(role: str, label: str, required: bool, types: list[str], *, multiple: bool = False) -> dict[str, Any]:
    return {"role": role, "label": label, "required": required, "types": types, "multiple": multiple}


# Static chart definitions. `engine` decides the render path (client Plotly vs
# server image). `options` lists the customization controls that apply.
_COMMON_OPTS = ["title", "palette", "show_legend", "legend_position", "show_grid", "font_size"]

_CATALOG: list[dict[str, Any]] = [
    # --- Distribution ---
    {
        "id": "histogram", "label": "Histogram", "category": "Distribution", "engine": "plotly",
        "icon": "bar-chart-3", "featured": True,
        "description": "Frequency distribution of a numeric column.",
        "encodings": [_enc("x", "Value", True, ["numeric"]), _enc("color", "Group by", False, ["categorical", "boolean"])],
        "options": _COMMON_OPTS + ["bins", "opacity", "barmode"],
    },
    {
        "id": "box", "label": "Box Plot", "category": "Distribution", "engine": "plotly",
        "icon": "box", "featured": True,
        "description": "Median, quartiles and outliers, optionally split by a category.",
        "encodings": [_enc("y", "Value", True, ["numeric"]), _enc("x", "Category", False, ["categorical", "boolean"]),
                      _enc("color", "Color", False, ["categorical", "boolean"])],
        "options": _COMMON_OPTS + ["opacity"],
    },
    {
        "id": "violin", "label": "Violin Plot", "category": "Distribution", "engine": "plotly",
        "icon": "activity", "featured": False,
        "description": "Distribution shape of a numeric column across categories.",
        "encodings": [_enc("y", "Value", True, ["numeric"]), _enc("x", "Category", False, ["categorical", "boolean"])],
        "options": _COMMON_OPTS + ["opacity"],
    },
    # --- Comparison ---
    {
        "id": "bar", "label": "Bar Chart", "category": "Comparison", "engine": "plotly",
        "icon": "bar-chart-3", "featured": True,
        "description": "Compare an aggregated numeric value across categories.",
        "encodings": [_enc("x", "Category", True, ["categorical", "boolean", "datetime"]),
                      _enc("y", "Value", False, ["numeric"]),
                      _enc("color", "Group by", False, ["categorical", "boolean"])],
        "options": _COMMON_OPTS + ["aggregation", "sort", "limit", "orientation", "barmode", "opacity"],
    },
    {
        "id": "line", "label": "Line Chart", "category": "Time", "engine": "plotly",
        "icon": "line-chart", "featured": True,
        "description": "Trend of a numeric value across an ordered axis.",
        "encodings": [_enc("x", "Axis", True, ["datetime", "numeric", "categorical"]),
                      _enc("y", "Value", True, ["numeric"]),
                      _enc("color", "Series", False, ["categorical", "boolean"])],
        "options": _COMMON_OPTS + ["aggregation", "line_width", "marker_size", "smoothing"],
    },
    {
        "id": "area", "label": "Area Chart", "category": "Time", "engine": "plotly",
        "icon": "area-chart", "featured": False,
        "description": "Filled trend of a numeric value over time.",
        "encodings": [_enc("x", "Axis", True, ["datetime", "numeric", "categorical"]),
                      _enc("y", "Value", True, ["numeric"]),
                      _enc("color", "Series", False, ["categorical", "boolean"])],
        "options": _COMMON_OPTS + ["aggregation", "line_width", "opacity", "smoothing"],
    },
    # --- Relationship ---
    {
        "id": "scatter", "label": "Scatter Plot", "category": "Relationship", "engine": "plotly",
        "icon": "scatter-chart", "featured": True,
        "description": "Relationship between two numeric columns.",
        "encodings": [_enc("x", "X axis", True, ["numeric"]), _enc("y", "Y axis", True, ["numeric"]),
                      _enc("color", "Color", False, ["categorical", "boolean", "numeric"]),
                      _enc("size", "Size", False, ["numeric"])],
        "options": _COMMON_OPTS + ["regression", "opacity", "marker_size", "color_scale"],
    },
    {
        "id": "bubble", "label": "Bubble Chart", "category": "Relationship", "engine": "plotly",
        "icon": "circle", "featured": False,
        "description": "Scatter with a third numeric encoded as marker size.",
        "encodings": [_enc("x", "X axis", True, ["numeric"]), _enc("y", "Y axis", True, ["numeric"]),
                      _enc("size", "Size", True, ["numeric"]),
                      _enc("color", "Color", False, ["categorical", "boolean", "numeric"])],
        "options": _COMMON_OPTS + ["opacity", "color_scale"],
    },
    {
        "id": "density_heatmap", "label": "Density Heatmap", "category": "Relationship", "engine": "plotly",
        "icon": "grid-3x3", "featured": False,
        "description": "2D histogram of two numeric columns (point density).",
        "encodings": [_enc("x", "X axis", True, ["numeric"]), _enc("y", "Y axis", True, ["numeric"])],
        "options": ["title", "font_size", "color_scale", "bins"],
    },
    {
        "id": "heatmap", "label": "Correlation Heatmap", "category": "Relationship", "engine": "plotly",
        "icon": "grid-3x3", "featured": True,
        "description": "Pairwise correlation across numeric columns.",
        "encodings": [_enc("columns", "Columns", False, ["numeric"], multiple=True)],
        "options": ["title", "font_size", "color_scale"],
    },
    # --- Composition ---
    {
        "id": "pie", "label": "Pie Chart", "category": "Composition", "engine": "plotly",
        "icon": "pie-chart", "featured": True,
        "description": "Share of each category in a total.",
        "encodings": [_enc("names", "Category", True, ["categorical", "boolean"]),
                      _enc("values", "Value", False, ["numeric"])],
        "options": _COMMON_OPTS + ["aggregation", "limit", "donut"],
    },
    {
        "id": "treemap", "label": "Treemap", "category": "Composition", "engine": "plotly",
        "icon": "layout-dashboard", "featured": False,
        "description": "Hierarchical composition as nested rectangles.",
        "encodings": [_enc("path", "Hierarchy", True, ["categorical", "boolean"], multiple=True),
                      _enc("values", "Value", False, ["numeric"])],
        "options": ["title", "palette", "font_size", "aggregation"],
    },
    {
        "id": "sunburst", "label": "Sunburst", "category": "Composition", "engine": "plotly",
        "icon": "loader", "featured": False,
        "description": "Hierarchical composition as concentric rings.",
        "encodings": [_enc("path", "Hierarchy", True, ["categorical", "boolean"], multiple=True),
                      _enc("values", "Value", False, ["numeric"])],
        "options": ["title", "palette", "font_size", "aggregation"],
    },
    # --- Statistical (server-rendered images) ---
    {
        "id": "pairplot", "label": "Pair Plot", "category": "Statistical", "engine": "image",
        "icon": "grid-2x2", "featured": True,
        "description": "Scatter matrix of numeric columns with hue-coded groups.",
        "encodings": [_enc("columns", "Columns", False, ["numeric"], multiple=True),
                      _enc("color", "Hue", False, ["categorical", "boolean"])],
        "options": ["title", "palette"],
    },
    {
        "id": "jointplot", "label": "Joint Plot", "category": "Statistical", "engine": "image",
        "icon": "scatter-chart", "featured": False,
        "description": "Bivariate relationship with marginal distributions.",
        "encodings": [_enc("x", "X axis", True, ["numeric"]), _enc("y", "Y axis", True, ["numeric"]),
                      _enc("color", "Hue", False, ["categorical", "boolean"])],
        "options": ["title", "palette", "kind"],
    },
    {
        "id": "kde", "label": "KDE Plot", "category": "Statistical", "engine": "image",
        "icon": "activity", "featured": False,
        "description": "Smoothed density estimate of a numeric column.",
        "encodings": [_enc("x", "Value", True, ["numeric"]), _enc("color", "Hue", False, ["categorical", "boolean"])],
        "options": ["title", "palette"],
    },
    {
        "id": "regression", "label": "Regression Plot", "category": "Statistical", "engine": "image",
        "icon": "trending-up", "featured": True,
        "description": "Scatter with fitted regression line and confidence band.",
        "encodings": [_enc("x", "X axis", True, ["numeric"]), _enc("y", "Y axis", True, ["numeric"])],
        "options": ["title", "palette", "order"],
    },
    {
        "id": "distribution", "label": "Distribution Plot", "category": "Statistical", "engine": "image",
        "icon": "bar-chart-3", "featured": False,
        "description": "Histogram with an overlaid density curve.",
        "encodings": [_enc("x", "Value", True, ["numeric"]), _enc("color", "Hue", False, ["categorical", "boolean"])],
        "options": ["title", "palette", "bins"],
    },
    {
        "id": "clustermap", "label": "Cluster Map", "category": "Statistical", "engine": "image",
        "icon": "grid-3x3", "featured": False,
        "description": "Hierarchically-clustered correlation matrix.",
        "encodings": [_enc("columns", "Columns", False, ["numeric"], multiple=True)],
        "options": ["title"],
    },
]


# --- Map charts (Explore "Maps" segment, rendered client-side via mapbox) ----
_MAPS: list[dict[str, Any]] = [
    {
        "id": "scatter_map", "label": "Scatter Map", "category": "Points", "engine": "map",
        "segment": "map", "icon": "map-pin", "featured": True,
        "description": "Plot individual points by latitude / longitude.",
        "encodings": [_enc("lat", "Latitude", True, ["numeric"]), _enc("lon", "Longitude", True, ["numeric"]),
                      _enc("color", "Color", False, ["categorical", "boolean", "numeric"]),
                      _enc("size", "Size", False, ["numeric"])],
        "options": ["title", "map_theme", "color_scale", "opacity", "marker_size"],
    },
    {
        "id": "bubble_map", "label": "Bubble Map", "category": "Points", "engine": "map",
        "segment": "map", "icon": "circle", "featured": False,
        "description": "Scale point size by a numeric value on the map.",
        "encodings": [_enc("lat", "Latitude", True, ["numeric"]), _enc("lon", "Longitude", True, ["numeric"]),
                      _enc("size", "Size", True, ["numeric"]),
                      _enc("color", "Color", False, ["categorical", "boolean", "numeric"])],
        "options": ["title", "map_theme", "color_scale", "opacity", "marker_size"],
    },
    {
        "id": "cluster_map", "label": "Cluster Map", "category": "Points", "engine": "map",
        "segment": "map", "icon": "group", "featured": True,
        "description": "Group nearby points into KMeans clusters.",
        "encodings": [_enc("lat", "Latitude", True, ["numeric"]), _enc("lon", "Longitude", True, ["numeric"])],
        "options": ["title", "map_theme", "n_clusters", "marker_size"],
    },
    {
        "id": "density_map", "label": "Density Map", "category": "Density", "engine": "map",
        "segment": "map", "icon": "flame", "featured": True,
        "description": "Smoothed point-density surface on the map.",
        "encodings": [_enc("lat", "Latitude", True, ["numeric"]), _enc("lon", "Longitude", True, ["numeric"])],
        "options": ["title", "map_theme", "color_scale", "radius"],
    },
    {
        "id": "heat_map", "label": "Heat Map", "category": "Density", "engine": "map",
        "segment": "map", "icon": "flame", "featured": False,
        "description": "Weighted density surface using a numeric intensity.",
        "encodings": [_enc("lat", "Latitude", True, ["numeric"]), _enc("lon", "Longitude", True, ["numeric"]),
                      _enc("z", "Intensity", False, ["numeric"])],
        "options": ["title", "map_theme", "color_scale", "radius"],
    },
    {
        "id": "hexbin_map", "label": "Hexbin Map", "category": "Density", "engine": "map",
        "segment": "map", "icon": "grid-3x3", "featured": False,
        "description": "Aggregate points into grid cells sized by count.",
        "encodings": [_enc("lat", "Latitude", True, ["numeric"]), _enc("lon", "Longitude", True, ["numeric"])],
        "options": ["title", "map_theme", "color_scale", "grid_size"],
    },
    {
        "id": "choropleth", "label": "Choropleth", "category": "Regions", "engine": "map",
        "segment": "map", "icon": "map", "featured": True,
        "description": "Shade regions (countries / US states) by a value.",
        "encodings": [_enc("location", "Region", True, ["categorical", "boolean"]),
                      _enc("value", "Value", False, ["numeric"])],
        "options": ["title", "color_scale", "locationmode"],
    },
]

# Location modes for the choropleth control.
LOCATION_MODES = [
    {"id": "country names", "label": "Countries"},
    {"id": "USA-states", "label": "US States"},
    {"id": "ISO-3", "label": "ISO-3 codes"},
]


def column_metadata(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Per-column semantic type + cardinality for building adaptive controls."""
    meta: list[dict[str, Any]] = []
    n = max(len(df), 1)
    for c in df.columns:
        s = df[c]
        stype = _semantic_type(s)
        meta.append(
            {
                "name": str(c),
                "semantic_type": stype,
                "unique": int(s.dropna().nunique()),
                "missing_pct": round(float(s.isna().sum()) / n * 100, 2),
            }
        )
    return meta


def catalog_for_dataframe(df: pd.DataFrame) -> dict[str, Any]:
    """Return the chart catalog + column metadata + style tokens for a dataset."""
    columns = column_metadata(df)
    available: set[str] = {c["semantic_type"] for c in columns}
    has_numeric = "numeric" in available
    numeric_count = sum(1 for c in columns if c["semantic_type"] == "numeric")

    charts: list[dict[str, Any]] = []
    for entry in _CATALOG + _MAPS:
        # A chart is "enabled" when every required encoding can be satisfied by
        # at least one column of an accepted type in this dataset.
        enabled = True
        for enc in entry["encodings"]:
            if not enc["required"]:
                continue
            if not (available & set(enc["types"])):
                enabled = False
                break
        # Correlation / pair / cluster charts need at least two numeric columns.
        if entry["id"] in ("heatmap", "pairplot", "clustermap") and numeric_count < 2:
            enabled = False
        if entry["id"] in ("scatter", "bubble", "density_heatmap", "jointplot", "regression") and not has_numeric:
            enabled = False
        # Maps that need both lat and lon require at least two numeric columns.
        if entry.get("segment") == "map" and entry["id"] != "choropleth" and numeric_count < 2:
            enabled = False
        charts.append({**entry, "segment": entry.get("segment", "chart"), "enabled": enabled})

    return {
        "columns": columns,
        "charts": charts,
        "categories": CATEGORIES,
        "map_categories": MAP_CATEGORIES,
        "palettes": PALETTES,
        "color_scales": COLOR_SCALES,
        "themes": THEMES,
        "location_modes": LOCATION_MODES,
        "aggregations": ["mean", "sum", "count", "median", "min", "max"],
    }


def get_chart_def(chart_type: str) -> dict[str, Any] | None:
    for entry in _CATALOG + _MAPS:
        if entry["id"] == chart_type:
            return entry
    return None
