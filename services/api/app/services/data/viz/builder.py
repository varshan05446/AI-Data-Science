"""Turn a chart type + column encodings + style options into a render spec.

Plotly charts return tidy ``data`` rows + an ``encoding`` map + normalised
``options`` (rendered client-side). Statistical charts delegate to
``image_builder`` and return a base64 ``image`` (rendered server-side). Every
payload is deterministic, row-capped and JSON-safe.
"""
from __future__ import annotations

from typing import Any, Callable

import numpy as np
import pandas as pd

from app.services.data.profiling import _py, _semantic_type
from app.services.data.viz.catalog import get_chart_def
from app.services.data.viz.image_builder import build_image_chart
from app.services.data.viz.map_builder import build_map_chart

_ROW_CAP = 3000
_CAT_CAP = 30


class ChartBuildError(ValueError):
    """Raised when a chart spec cannot be satisfied by the dataset."""


# --- small helpers -----------------------------------------------------------
def _get(encodings: dict[str, Any], role: str) -> str | None:
    v = encodings.get(role)
    if isinstance(v, list):
        return str(v[0]) if v else None
    return str(v) if v not in (None, "") else None


def _get_list(encodings: dict[str, Any], role: str) -> list[str]:
    v = encodings.get(role)
    if isinstance(v, list):
        return [str(x) for x in v if x]
    return [str(v)] if v not in (None, "") else []


def _require(col: str | None, role: str) -> str:
    if not col:
        raise ChartBuildError(f"The '{role}' field is required for this chart.")
    return col


def _numeric(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce")


def _records(df: pd.DataFrame) -> list[dict[str, Any]]:
    return [{str(k): _py(v) for k, v in row.items()} for row in df.to_dict(orient="records")]


def _aggregate(
    df: pd.DataFrame, group_cols: list[str], value_col: str | None, agg: str
) -> tuple[pd.DataFrame, str]:
    """Group by ``group_cols`` and reduce ``value_col`` with ``agg``."""
    work = df.copy()
    for g in group_cols:
        work[g] = work[g].astype(str)
    if agg == "count" or value_col is None:
        out = work.groupby(group_cols, dropna=False).size().reset_index(name="__value__")
        value_out = "__value__"
    else:
        work[value_col] = _numeric(work[value_col])
        out = (
            work.dropna(subset=[value_col])
            .groupby(group_cols, dropna=False)[value_col]
            .agg(agg)
            .reset_index()
        )
        value_out = value_col
    return out, value_out


def _finalise(
    chart_type: str,
    *,
    title: str,
    data: list[dict[str, Any]],
    encoding: dict[str, Any],
    options: dict[str, Any],
    summary: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "id": f"viz_{chart_type}",
        "type": chart_type,
        "engine": "plotly",
        "title": title,
        "encoding": encoding,
        "data": data,
        "options": _clean_options(options),
        "summary": summary,
    }
    if extra:
        payload.update(extra)
    return payload


def _clean_options(options: dict[str, Any]) -> dict[str, Any]:
    """Keep only known style options, coercing numeric ones."""
    out: dict[str, Any] = {}
    for key in ("palette", "color_scale", "legend_position", "orientation", "barmode", "aggregation"):
        if options.get(key):
            out[key] = options[key]
    for key in ("opacity", "line_width", "marker_size", "font_size", "bins", "smoothing"):
        if options.get(key) is not None:
            try:
                out[key] = float(options[key])
            except (TypeError, ValueError):
                pass
    for key in ("show_legend", "show_grid", "donut", "regression"):
        if key in options:
            out[key] = bool(options[key])
    if options.get("title"):
        out["title"] = str(options["title"])
    return out


# --- Plotly chart builders ---------------------------------------------------
def _histogram(df, encodings, options):
    x = _require(_get(encodings, "x"), "x")
    color = _get(encodings, "color")
    cols = [x] + ([color] if color else [])
    sub = df[cols].copy()
    sub[x] = _numeric(sub[x])
    sub = sub.dropna(subset=[x]).head(_ROW_CAP * 3)
    if color:
        sub[color] = sub[color].astype(str)
    enc = {"x": x, **({"color": color} if color else {})}
    s = sub[x]
    summary = f"'{x}' ranges {s.min():.2f}-{s.max():.2f} (mean {s.mean():.2f})." if len(s) else f"Distribution of {x}."
    return _finalise("histogram", title=options.get("title") or f"Distribution of {x}",
                     data=_records(sub), encoding=enc, options=options, summary=summary)


def _box(df, encodings, options):
    y = _require(_get(encodings, "y"), "y")
    x = _get(encodings, "x")
    color = _get(encodings, "color")
    cols = [y] + ([x] if x else []) + ([color] if color and color != x else [])
    sub = df[list(dict.fromkeys(cols))].copy()
    sub[y] = _numeric(sub[y])
    sub = sub.dropna(subset=[y]).head(_ROW_CAP)
    for c in (x, color):
        if c:
            sub[c] = sub[c].astype(str)
    enc = {"y": y, **({"x": x} if x else {}), **({"color": color} if color else {})}
    return _finalise("box", title=options.get("title") or (f"{y} by {x}" if x else f"Spread of {y}"),
                     data=_records(sub), encoding=enc, options=options,
                     summary=f"Distribution of '{y}'" + (f" across '{x}'." if x else "."))


def _violin(df, encodings, options):
    y = _require(_get(encodings, "y"), "y")
    x = _get(encodings, "x")
    cols = [y] + ([x] if x else [])
    sub = df[cols].copy()
    sub[y] = _numeric(sub[y])
    sub = sub.dropna(subset=[y]).head(_ROW_CAP)
    if x:
        sub[x] = sub[x].astype(str)
        # cap to the most frequent categories for readability
        top = sub[x].value_counts().head(8).index
        sub = sub[sub[x].isin(top)]
    enc = {"value": y, **({"group": x} if x else {})}
    return _finalise("violin", title=options.get("title") or (f"{y} by {x}" if x else f"Distribution of {y}"),
                     data=_records(sub), encoding=enc, options=options,
                     summary=f"Distribution shape of '{y}'" + (f" across '{x}'." if x else "."))


def _bar(df, encodings, options):
    x = _require(_get(encodings, "x"), "x")
    y = _get(encodings, "y")
    color = _get(encodings, "color")
    agg = options.get("aggregation") or ("count" if not y else "mean")
    group_cols = [x] + ([color] if color and color != x else [])
    sub = df[list(dict.fromkeys(group_cols + ([y] if y else [])))].copy()
    agg_df, value_key = _aggregate(sub, group_cols, y, agg)
    # sort + limit categories by the aggregated value
    sort = options.get("sort")
    if sort in ("asc", "desc"):
        totals = agg_df.groupby(x)[value_key].sum().sort_values(ascending=(sort == "asc"))
        order = list(totals.index)
        agg_df["__ord__"] = agg_df[x].map({k: i for i, k in enumerate(order)})
        agg_df = agg_df.sort_values("__ord__").drop(columns="__ord__")
    limit = int(options.get("limit", _CAT_CAP) or _CAT_CAP)
    keep = list(pd.Index(agg_df[x].unique())[:limit])
    agg_df = agg_df[agg_df[x].isin(keep)]
    enc = {"x": x, "y": value_key, **({"color": color} if color and color != x else {})}
    barmode = options.get("barmode") or ("stack" if color else "group")
    opts = {**options, "barmode": barmode}
    label = "count" if agg == "count" else f"{agg} of {y}"
    return _finalise("bar", title=options.get("title") or f"{label} by {x}",
                     data=_records(agg_df), encoding=enc, options=opts,
                     summary=f"{label.capitalize()} across values of '{x}'.")


def _line_area(chart_type, df, encodings, options):
    x = _require(_get(encodings, "x"), "x")
    y = _require(_get(encodings, "y"), "y")
    color = _get(encodings, "color")
    agg = options.get("aggregation") or "mean"
    cols = [x, y] + ([color] if color else [])
    sub = df[list(dict.fromkeys(cols))].copy()
    stype = _semantic_type(df[x])
    if stype == "datetime":
        sub[x] = pd.to_datetime(sub[x], errors="coerce", format="mixed")
    elif stype == "numeric":
        sub[x] = _numeric(sub[x])
    sub[y] = _numeric(sub[y])
    sub = sub.dropna(subset=[x, y])
    group_cols = [x] + ([color] if color else [])
    if color:
        sub[color] = sub[color].astype(str)
    grouped = sub.groupby(group_cols, dropna=False)[y].agg(agg).reset_index()
    grouped = grouped.sort_values(x).head(_ROW_CAP)
    if stype == "datetime":
        grouped[x] = grouped[x].astype(str)
    enc = {"x": x, "y": y, **({"color": color} if color else {})}
    return _finalise(chart_type, title=options.get("title") or f"{y} over {x}",
                     data=_records(grouped), encoding=enc, options=options,
                     summary=f"{agg.capitalize()} of '{y}' across '{x}'.")


def _scatter(chart_type, df, encodings, options):
    x = _require(_get(encodings, "x"), "x")
    y = _require(_get(encodings, "y"), "y")
    color = _get(encodings, "color")
    size = _get(encodings, "size")
    if chart_type == "bubble":
        size = _require(size, "size")
    cols = [x, y] + [c for c in (color, size) if c]
    sub = df[list(dict.fromkeys(cols))].copy()
    sub[x] = _numeric(sub[x])
    sub[y] = _numeric(sub[y])
    if size:
        sub[size] = _numeric(sub[size])
    color_numeric = bool(color) and _semantic_type(df[color]) == "numeric"
    if color and not color_numeric:
        sub[color] = sub[color].astype(str)
    sub = sub.dropna(subset=[x, y]).head(_ROW_CAP)
    enc = {"x": x, "y": y}
    if color:
        enc["color"] = color
    if size:
        enc["size"] = size
    opts = dict(options)
    opts["color_is_numeric"] = color_numeric
    # optional linear trendline computed server-side
    if options.get("regression") and len(sub) > 2:
        xs, ys = sub[x].to_numpy(dtype=float), sub[y].to_numpy(dtype=float)
        slope, intercept = np.polyfit(xs, ys, 1)
        extra = {"trendline": {
            "x0": _py(xs.min()), "y0": _py(slope * xs.min() + intercept),
            "x1": _py(xs.max()), "y1": _py(slope * xs.max() + intercept),
        }}
    else:
        extra = None
    corr = float(sub[x].corr(sub[y])) if len(sub) > 2 else 0.0
    return _finalise(chart_type, title=options.get("title") or f"{y} vs {x}",
                     data=_records(sub), encoding=enc, options=opts,
                     summary=f"Relationship between '{x}' and '{y}' (r={corr:.2f}).", extra=extra)


def _density_heatmap(df, encodings, options):
    x = _require(_get(encodings, "x"), "x")
    y = _require(_get(encodings, "y"), "y")
    sub = df[[x, y]].copy()
    sub[x] = _numeric(sub[x])
    sub[y] = _numeric(sub[y])
    sub = sub.dropna().head(_ROW_CAP * 2)
    return _finalise("density_heatmap", title=options.get("title") or f"Density of {y} vs {x}",
                     data=_records(sub), encoding={"x": x, "y": y}, options=options,
                     summary=f"Point density across '{x}' and '{y}'.")


def _pie(df, encodings, options):
    names = _require(_get(encodings, "names"), "names")
    values = _get(encodings, "values")
    agg = options.get("aggregation") or ("count" if not values else "sum")
    sub = df[[names] + ([values] if values else [])].copy()
    agg_df, value_key = _aggregate(sub, [names], values, agg)
    agg_df = agg_df.sort_values(value_key, ascending=False)
    limit = int(options.get("limit", 10) or 10)
    if len(agg_df) > limit:
        top = agg_df.head(limit - 1)
        other = agg_df.iloc[limit - 1:][value_key].sum()
        top = pd.concat([top, pd.DataFrame([{names: "Other", value_key: other}])], ignore_index=True)
        agg_df = top
    enc = {"names": names, "values": value_key}
    return _finalise("pie", title=options.get("title") or f"Composition of {names}",
                     data=_records(agg_df), encoding=enc, options=options,
                     summary=f"Share of each value of '{names}'.")


def _hierarchy(chart_type, df, encodings, options):
    path = _get_list(encodings, "path")
    if not path:
        raise ChartBuildError("Select at least one hierarchy column.")
    values = _get(encodings, "values")
    agg = options.get("aggregation") or ("count" if not values else "sum")
    sub = df[list(dict.fromkeys(path + ([values] if values else [])))].copy()
    for p in path:
        sub[p] = sub[p].astype(str)
    agg_df, value_key = _aggregate(sub, path, values, agg)

    ids: list[str] = []
    labels: list[str] = []
    parents: list[str] = []
    node_values: dict[str, float] = {}
    for _, row in agg_df.iterrows():
        prefix = ""
        parent_id = ""
        for depth, p in enumerate(path):
            label = str(row[p])
            node_id = f"{prefix}/{label}" if prefix else label
            node_values[node_id] = node_values.get(node_id, 0.0) + float(row[value_key])
            if node_id not in ids:
                ids.append(node_id)
                labels.append(label)
                parents.append(parent_id)
            prefix = node_id
            parent_id = node_id
    tree = {
        "ids": ids,
        "labels": labels,
        "parents": parents,
        "values": [_py(round(node_values[i], 4)) for i in ids],
    }
    return _finalise(chart_type, title=options.get("title") or f"{chart_type.title()} of {' / '.join(path)}",
                     data=[], encoding={"path": path, "values": value_key}, options=options,
                     summary=f"Hierarchical composition across {', '.join(path)}.",
                     extra={"tree": tree})


def _heatmap(df, encodings, options):
    cols = _get_list(encodings, "columns")
    if not cols:
        cols = [str(c) for c in df.columns if _semantic_type(df[c]) == "numeric"]
    cols = cols[:20]
    if len(cols) < 2:
        raise ChartBuildError("Correlation heatmap needs at least two numeric columns.")
    corr = df[cols].apply(pd.to_numeric, errors="coerce").corr(numeric_only=True).round(2)
    corr = corr.dropna(how="all").dropna(axis=1, how="all")
    ordered = list(corr.columns)
    cells = [{"x": a, "y": b, "value": _py(corr.loc[b, a])} for a in ordered for b in ordered]
    return _finalise("heatmap", title=options.get("title") or "Correlation heatmap",
                     data=cells, encoding={"x": "x", "y": "y", "value": "value"}, options=options,
                     summary="Pairwise correlation across numeric columns.",
                     extra={"columns": ordered})


_PLOTLY_BUILDERS: dict[str, Callable[..., dict[str, Any]]] = {
    "histogram": lambda df, e, o: _histogram(df, e, o),
    "box": lambda df, e, o: _box(df, e, o),
    "violin": lambda df, e, o: _violin(df, e, o),
    "bar": lambda df, e, o: _bar(df, e, o),
    "line": lambda df, e, o: _line_area("line", df, e, o),
    "area": lambda df, e, o: _line_area("area", df, e, o),
    "scatter": lambda df, e, o: _scatter("scatter", df, e, o),
    "bubble": lambda df, e, o: _scatter("bubble", df, e, o),
    "density_heatmap": lambda df, e, o: _density_heatmap(df, e, o),
    "pie": lambda df, e, o: _pie(df, e, o),
    "treemap": lambda df, e, o: _hierarchy("treemap", df, e, o),
    "sunburst": lambda df, e, o: _hierarchy("sunburst", df, e, o),
    "heatmap": lambda df, e, o: _heatmap(df, e, o),
}


def build_chart(
    df: pd.DataFrame,
    chart_type: str,
    encodings: dict[str, Any] | None = None,
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a render spec for ``chart_type`` from the dataset.

    Returns a Plotly spec (``engine='plotly'``) or a base64 image
    (``engine='image'``). Raises :class:`ChartBuildError` for bad specs.
    """
    encodings = encodings or {}
    options = options or {}
    definition = get_chart_def(chart_type)
    if definition is None:
        raise ChartBuildError(f"Unknown chart type: {chart_type}")

    if definition["engine"] == "image":
        return build_image_chart(df, chart_type, encodings, options)
    if definition["engine"] == "map":
        return build_map_chart(df, chart_type, encodings, options)

    builder = _PLOTLY_BUILDERS.get(chart_type)
    if builder is None:  # pragma: no cover - catalog/builders kept in sync
        raise ChartBuildError(f"Chart type '{chart_type}' has no builder.")
    return builder(df, encodings, options)
