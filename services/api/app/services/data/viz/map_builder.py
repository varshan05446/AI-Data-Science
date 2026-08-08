"""Geospatial map builders for the Explore *Maps* segment.

Each builder returns a Plotly-friendly spec tagged ``engine='map'``. The frontend
renders these with ``scattermapbox`` / ``densitymapbox`` / ``choropleth`` traces.
Latitude/longitude are auto-coerced to numeric; results are deterministic,
row-capped and JSON-safe. ``cluster_map`` computes KMeans clusters server-side.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from app.services.data.profiling import _py, _semantic_type

_MAP_ROW_CAP = 5000
_DEF_STYLE = "carto-positron"

# Map a theme id -> mapbox style (mirrors catalog THEMES; kept token-free).
_THEME_STYLE = {
    "light": "carto-positron",
    "dark": "carto-darkmatter",
    "street": "open-street-map",
}


class MapBuildError(ValueError):
    """Raised when a map spec cannot be satisfied by the dataset."""


def _num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce")


def _records(df: pd.DataFrame) -> list[dict[str, Any]]:
    return [{str(k): _py(v) for k, v in row.items()} for row in df.to_dict(orient="records")]


def _first(encodings: dict[str, Any], role: str) -> str | None:
    v = encodings.get(role)
    if isinstance(v, list):
        return str(v[0]) if v else None
    return str(v) if v not in (None, "") else None


def _require(col: str | None, role: str) -> str:
    if not col:
        raise MapBuildError(f"The '{role}' field is required for this map.")
    return col


def _center_zoom(lats: np.ndarray, lons: np.ndarray) -> tuple[dict[str, float], float]:
    """Rough center + zoom from coordinate bounds (token-free heuristic)."""
    if lats.size == 0:
        return {"lat": 20.0, "lon": 0.0}, 1.0
    span = max(float(np.ptp(lats)), float(np.ptp(lons)), 0.02)
    zoom = float(np.clip(round(math.log2(360.0 / span)) - 1, 1, 12))
    return {"lat": float(np.mean(lats)), "lon": float(np.mean(lons))}, zoom


def _style(options: dict[str, Any]) -> str:
    theme = options.get("map_theme")
    return _THEME_STYLE.get(str(theme), str(theme) if theme else _DEF_STYLE)


def _map_options(options: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if options.get("title"):
        out["title"] = str(options["title"])
    if options.get("color_scale"):
        out["color_scale"] = str(options["color_scale"])
    if options.get("locationmode"):
        out["locationmode"] = str(options["locationmode"])
    for key in ("opacity", "marker_size", "radius", "grid_size", "n_clusters"):
        if options.get(key) is not None:
            try:
                out[key] = float(options[key])
            except (TypeError, ValueError):
                pass
    return out


def _finalise(
    chart_type: str,
    *,
    title: str,
    data: list[dict[str, Any]],
    encoding: dict[str, Any],
    options: dict[str, Any],
    summary: str,
    map_meta: dict[str, Any],
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": f"map_{chart_type}",
        "type": chart_type,
        "engine": "map",
        "title": title,
        "encoding": encoding,
        "data": data,
        "options": _map_options(options),
        "summary": summary,
        "map": map_meta,
    }
    if extra:
        payload.update(extra)
    return payload


def _coords(df: pd.DataFrame, encodings: dict[str, Any], extra_cols: list[str]) -> tuple[pd.DataFrame, str, str]:
    lat = _require(_first(encodings, "lat"), "lat")
    lon = _require(_first(encodings, "lon"), "lon")
    keep = list(dict.fromkeys([lat, lon] + [c for c in extra_cols if c]))
    sub = df[keep].copy()
    sub[lat] = _num(sub[lat])
    sub[lon] = _num(sub[lon])
    sub = sub.dropna(subset=[lat, lon])
    # Guard against bad coordinate ranges.
    sub = sub[(sub[lat].between(-90, 90)) & (sub[lon].between(-180, 180))]
    sub = sub.head(_MAP_ROW_CAP)
    if sub.empty:
        raise MapBuildError("No valid latitude/longitude values in the selected columns.")
    return sub, lat, lon


# --- builders ----------------------------------------------------------------
def _scatter_map(chart_type: str, df, encodings, options):
    color = _first(encodings, "color")
    size = _first(encodings, "size")
    if chart_type == "bubble_map":
        size = _require(size, "size")
    sub, lat, lon = _coords(df, encodings, [color, size])
    if size:
        sub[size] = _num(sub[size])
    color_numeric = bool(color) and _semantic_type(df[color]) == "numeric"
    if color and not color_numeric:
        sub[color] = sub[color].astype(str)
    enc: dict[str, Any] = {"lat": lat, "lon": lon}
    if color:
        enc["color"] = color
    if size:
        enc["size"] = size
    opts = dict(options)
    opts["color_is_numeric"] = color_numeric
    center, zoom = _center_zoom(sub[lat].to_numpy(), sub[lon].to_numpy())
    return _finalise(chart_type, title=options.get("title") or f"{lat} / {lon} map",
                     data=_records(sub), encoding=enc, options=opts,
                     summary=f"{len(sub)} points plotted by location.",
                     map_meta={"style": _style(options), "center": center, "zoom": zoom})


def _density_map(chart_type: str, df, encodings, options):
    z = _first(encodings, "z") if chart_type == "heat_map" else None
    sub, lat, lon = _coords(df, encodings, [z])
    if z:
        sub[z] = _num(sub[z])
        sub = sub.dropna(subset=[z])
    enc: dict[str, Any] = {"lat": lat, "lon": lon, **({"z": z} if z else {})}
    center, zoom = _center_zoom(sub[lat].to_numpy(), sub[lon].to_numpy())
    label = "Weighted heat map" if z else "Point density"
    return _finalise(chart_type, title=options.get("title") or label,
                     data=_records(sub), encoding=enc, options=options,
                     summary=f"{label} across {len(sub)} points.",
                     map_meta={"style": _style(options), "center": center, "zoom": zoom})


def _hexbin_map(df, encodings, options):
    sub, lat, lon = _coords(df, encodings, [])
    grid = int(options.get("grid_size", 30) or 30)
    grid = max(6, min(grid, 80))
    lats, lons = sub[lat].to_numpy(), sub[lon].to_numpy()
    lat_min, lat_max = lats.min(), lats.max()
    lon_min, lon_max = lons.min(), lons.max()
    lat_step = max((lat_max - lat_min) / grid, 1e-9)
    lon_step = max((lon_max - lon_min) / grid, 1e-9)
    sub = sub.assign(
        __r__=np.floor((lats - lat_min) / lat_step).astype(int),
        __c__=np.floor((lons - lon_min) / lon_step).astype(int),
    )
    cells = (
        sub.groupby(["__r__", "__c__"])
        .agg(lat=(lat, "mean"), lon=(lon, "mean"), count=(lat, "size"))
        .reset_index()[["lat", "lon", "count"]]
    )
    center, zoom = _center_zoom(lats, lons)
    return _finalise("hexbin_map", title=options.get("title") or "Binned density map",
                     data=_records(cells), encoding={"lat": "lat", "lon": "lon", "size": "count"},
                     options=options, summary=f"{len(sub)} points binned into {len(cells)} cells.",
                     map_meta={"style": _style(options), "center": center, "zoom": zoom})


def _cluster_map(df, encodings, options):
    sub, lat, lon = _coords(df, encodings, [])
    k = int(options.get("n_clusters", 5) or 5)
    k = max(2, min(k, 10, len(sub)))
    coords = sub[[lat, lon]].to_numpy(dtype=float)
    try:
        from sklearn.cluster import KMeans
        from sklearn.preprocessing import StandardScaler

        scaled = StandardScaler().fit_transform(coords)
        labels = KMeans(n_clusters=k, n_init=10, random_state=42).fit_predict(scaled)
    except Exception:  # pragma: no cover - sklearn is a core dependency
        # Fallback: simple longitude-based partition so the map still renders.
        order = np.argsort(coords[:, 1])
        labels = np.zeros(len(coords), dtype=int)
        for i, idx in enumerate(order):
            labels[idx] = int(i * k / len(order))
    sub = sub.assign(cluster=[f"Cluster {int(l) + 1}" for l in labels])
    center, zoom = _center_zoom(coords[:, 0], coords[:, 1])
    return _finalise("cluster_map", title=options.get("title") or f"{k} location clusters",
                     data=_records(sub), encoding={"lat": lat, "lon": lon, "color": "cluster"},
                     options=options, summary=f"{len(sub)} points grouped into {k} clusters.",
                     map_meta={"style": _style(options), "center": center, "zoom": zoom})


def _choropleth(df, encodings, options):
    location = _require(_first(encodings, "location"), "location")
    value = _first(encodings, "value")
    locationmode = options.get("locationmode") or "country names"
    keep = [location] + ([value] if value else [])
    sub = df[keep].copy()
    sub[location] = sub[location].astype(str)
    if value:
        sub[value] = _num(sub[value])
        agg = sub.dropna(subset=[value]).groupby(location, as_index=False)[value].mean()
        value_key = value
    else:
        agg = sub.groupby(location, as_index=False).size().rename(columns={"size": "count"})
        value_key = "count"
    agg = agg.head(500)
    return _finalise("choropleth", title=options.get("title") or f"{value_key} by {location}",
                     data=_records(agg), encoding={"location": location, "value": value_key},
                     options={**options, "locationmode": locationmode},
                     summary=f"{value_key.capitalize()} across {len(agg)} regions.",
                     map_meta={"style": _style(options), "center": {"lat": 20.0, "lon": 0.0}, "zoom": 1.0},
                     extra={"locationmode": locationmode})


_MAP_BUILDERS = {
    "scatter_map": lambda df, e, o: _scatter_map("scatter_map", df, e, o),
    "bubble_map": lambda df, e, o: _scatter_map("bubble_map", df, e, o),
    "density_map": lambda df, e, o: _density_map("density_map", df, e, o),
    "heat_map": lambda df, e, o: _density_map("heat_map", df, e, o),
    "hexbin_map": lambda df, e, o: _hexbin_map(df, e, o),
    "cluster_map": lambda df, e, o: _cluster_map(df, e, o),
    "choropleth": lambda df, e, o: _choropleth(df, e, o),
}


def is_map_type(chart_type: str) -> bool:
    return chart_type in _MAP_BUILDERS


def build_map_chart(
    df: pd.DataFrame,
    chart_type: str,
    encodings: dict[str, Any] | None = None,
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a map render spec (``engine='map'``)."""
    builder = _MAP_BUILDERS.get(chart_type)
    if builder is None:  # pragma: no cover - dispatch guarded by catalog
        raise MapBuildError(f"Unknown map type: {chart_type}")
    return builder(df, encodings or {}, options or {})
