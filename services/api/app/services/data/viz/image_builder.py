"""Server-side Seaborn/Matplotlib renderers for publication-grade statistical
charts. Each function returns a base64 PNG + SVG so the frontend can display,
export and copy the image without shipping a plotting engine to the browser.

All rendering uses the non-interactive Agg backend and is fully deterministic
(row-capped, seeded where relevant). Import of matplotlib/seaborn is lazy so the
API still boots when the optional deps are absent.
"""
from __future__ import annotations

import base64
import io
from typing import Any

import numpy as np
import pandas as pd

_ROW_CAP = 2000
_MAX_PAIR_COLS = 6


def matplotlib_available() -> bool:
    try:  # pragma: no cover - trivial import guard
        import matplotlib  # noqa: F401
        import seaborn  # noqa: F401

        return True
    except Exception:
        return False


def _numeric(df: pd.DataFrame, col: str) -> pd.Series:
    return pd.to_numeric(df[col], errors="coerce")


def _palette_colors(options: dict[str, Any]) -> list[str] | None:
    from app.services.data.viz.catalog import PALETTES

    pid = options.get("palette")
    if not pid:
        return None
    for p in PALETTES:
        if p["id"] == pid:
            return p["colors"]
    return None


def _fig_to_images(fig) -> dict[str, str]:
    """Serialise a Matplotlib figure to base64 PNG (hi-DPI) + SVG."""
    import matplotlib.pyplot as plt

    png_buf = io.BytesIO()
    fig.savefig(png_buf, format="png", dpi=150, bbox_inches="tight", facecolor="none")
    svg_buf = io.BytesIO()
    fig.savefig(svg_buf, format="svg", bbox_inches="tight", facecolor="none")
    plt.close(fig)
    return {
        "png": base64.b64encode(png_buf.getvalue()).decode("ascii"),
        "svg": base64.b64encode(svg_buf.getvalue()).decode("ascii"),
    }


def _prepare(df: pd.DataFrame, cols: list[str], *, cap: int = _ROW_CAP) -> pd.DataFrame:
    sub = df[cols].copy()
    for c in cols:
        if pd.api.types.is_object_dtype(sub[c]):
            # keep categorical hue columns as strings
            continue
    return sub.dropna().head(cap)


def build_image_chart(
    df: pd.DataFrame,
    chart_type: str,
    encodings: dict[str, Any],
    options: dict[str, Any],
) -> dict[str, Any]:
    """Render a statistical chart with Seaborn and return a base64 image spec."""
    if not matplotlib_available():
        raise RuntimeError(
            "Statistical charts require matplotlib + seaborn. Install them to enable this chart."
        )

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import seaborn as sns

    sns.set_theme(style="whitegrid", palette=_palette_colors(options) or "deep")
    title = options.get("title")

    def col(role: str) -> str | None:
        v = encodings.get(role)
        return str(v) if v else None

    def cols(role: str) -> list[str]:
        v = encodings.get(role)
        if isinstance(v, list):
            return [str(x) for x in v]
        return [str(v)] if v else []

    builder = {
        "pairplot": _pairplot,
        "jointplot": _jointplot,
        "kde": _kde,
        "regression": _regression,
        "distribution": _distribution,
        "clustermap": _clustermap,
    }.get(chart_type)
    if builder is None:
        raise ValueError(f"Unknown statistical chart type: {chart_type}")

    image, summary = builder(df, col, cols, options, plt, sns)
    return {
        "id": f"img_{chart_type}",
        "type": chart_type,
        "engine": "image",
        "title": title or _default_title(chart_type, col, cols),
        "image": image,
        "summary": summary,
    }


def _default_title(chart_type: str, col, cols) -> str:
    x, y = col("x"), col("y")
    if chart_type == "pairplot":
        return "Pair plot"
    if chart_type == "clustermap":
        return "Clustered correlation"
    if x and y:
        return f"{y} vs {x}"
    if x:
        return f"Distribution of {x}"
    return chart_type.title()


# --- Individual statistical renderers ----------------------------------------
def _numeric_columns(df: pd.DataFrame) -> list[str]:
    from app.services.data.profiling import _semantic_type

    return [str(c) for c in df.columns if _semantic_type(df[c]) == "numeric"]


def _pairplot(df, col, cols, options, plt, sns):
    chosen = cols("columns") or _numeric_columns(df)[:_MAX_PAIR_COLS]
    chosen = chosen[:_MAX_PAIR_COLS]
    hue = col("color")
    use = list(dict.fromkeys(chosen + ([hue] if hue else [])))
    sub = df[use].copy()
    for c in chosen:
        sub[c] = pd.to_numeric(sub[c], errors="coerce")
    sub = sub.dropna(subset=chosen).head(_ROW_CAP)
    grid = sns.pairplot(sub, vars=chosen, hue=hue if hue in sub.columns else None, corner=True,
                        plot_kws={"s": 18, "alpha": 0.6})
    fig = grid.figure
    return _fig_to_images(fig), f"Scatter matrix across {len(chosen)} numeric columns."


def _jointplot(df, col, cols, options, plt, sns):
    x, y = col("x"), col("y")
    hue = col("color")
    kind = options.get("kind", "scatter")
    if kind not in ("scatter", "hex", "kde", "reg"):
        kind = "scatter"
    sub = df[[x, y] + ([hue] if hue else [])].copy()
    sub[x] = pd.to_numeric(sub[x], errors="coerce")
    sub[y] = pd.to_numeric(sub[y], errors="coerce")
    sub = sub.dropna(subset=[x, y]).head(_ROW_CAP)
    kws: dict[str, Any] = {"data": sub, "x": x, "y": y, "kind": kind, "height": 6}
    if hue and hue in sub.columns and kind in ("scatter", "kde"):
        kws["hue"] = hue
    grid = sns.jointplot(**kws)
    return _fig_to_images(grid.figure), f"Joint distribution of {x} and {y}."


def _kde(df, col, cols, options, plt, sns):
    x = col("x")
    hue = col("color")
    sub = df[[x] + ([hue] if hue else [])].copy()
    sub[x] = pd.to_numeric(sub[x], errors="coerce")
    sub = sub.dropna(subset=[x]).head(_ROW_CAP)
    fig, ax = plt.subplots(figsize=(8, 5))
    sns.kdeplot(data=sub, x=x, hue=hue if hue in sub.columns else None, fill=True, alpha=0.4, ax=ax)
    if options.get("title"):
        ax.set_title(options["title"])
    return _fig_to_images(fig), f"Kernel density estimate of {x}."


def _regression(df, col, cols, options, plt, sns):
    x, y = col("x"), col("y")
    order = int(options.get("order", 1) or 1)
    sub = df[[x, y]].copy()
    sub[x] = pd.to_numeric(sub[x], errors="coerce")
    sub[y] = pd.to_numeric(sub[y], errors="coerce")
    sub = sub.dropna().head(_ROW_CAP)
    fig, ax = plt.subplots(figsize=(8, 5))
    sns.regplot(data=sub, x=x, y=y, order=max(1, min(order, 3)),
                scatter_kws={"s": 20, "alpha": 0.5}, line_kws={"color": "#ef4444"}, ax=ax)
    corr = float(sub[x].corr(sub[y])) if len(sub) > 2 else 0.0
    if options.get("title"):
        ax.set_title(options["title"])
    return _fig_to_images(fig), f"Regression of {y} on {x} (r={corr:.2f})."


def _distribution(df, col, cols, options, plt, sns):
    x = col("x")
    hue = col("color")
    bins = int(options.get("bins", 30) or 30)
    sub = df[[x] + ([hue] if hue else [])].copy()
    sub[x] = pd.to_numeric(sub[x], errors="coerce")
    sub = sub.dropna(subset=[x]).head(_ROW_CAP)
    fig, ax = plt.subplots(figsize=(8, 5))
    sns.histplot(data=sub, x=x, hue=hue if hue in sub.columns else None, kde=True,
                 bins=max(5, min(bins, 100)), alpha=0.6, ax=ax)
    if options.get("title"):
        ax.set_title(options["title"])
    return _fig_to_images(fig), f"Distribution of {x} with density overlay."


def _clustermap(df, col, cols, options, plt, sns):
    chosen = cols("columns") or _numeric_columns(df)
    sub = df[chosen].apply(pd.to_numeric, errors="coerce")
    corr = sub.corr(numeric_only=True).dropna(how="all").dropna(axis=1, how="all")
    if corr.shape[0] < 2:
        raise ValueError("Cluster map needs at least two numeric columns with variance.")
    grid = sns.clustermap(corr, cmap="RdBu_r", center=0, annot=False, figsize=(8, 8),
                          linewidths=0.5)
    return _fig_to_images(grid.figure), "Hierarchically clustered correlation matrix."
