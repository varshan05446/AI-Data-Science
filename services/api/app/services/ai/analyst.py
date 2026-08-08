"""Dataset-grounded analyst.

Given a parsed :class:`~app.services.ai.nlp.Understanding` and the actual
DataFrame, this computes a *real* answer (aggregations, rankings, correlations,
missingness, distributions, trends) and returns:

* a Markdown ``content`` string written like a senior data scientist would --
  what we found, why it matters, and a recommendation; and
* a structured ``payload`` (tables, a chart spec compatible with the frontend
  ChartRenderer, and generated SQL/Python) so the UI can render rich artefacts.

When the question is open-ended (intent == "general" or the data can't answer
it), the caller falls back to the configured LLM provider. Everything here is
deterministic and offline.
"""
from __future__ import annotations

import uuid
from typing import Any

import numpy as np
import pandas as pd

from app.services.ai.nlp import Understanding

# A chat answer is (markdown_content, structured_payload).
Answer = tuple[str, dict[str, Any]]

_MAX_TABLE_ROWS = 20


def _new_id() -> str:
    return uuid.uuid4().hex[:8]


def _fmt(value: Any) -> str:
    if isinstance(value, (int, np.integer)):
        return f"{int(value):,}"
    if isinstance(value, (float, np.floating)):
        v = float(value)
        if v.is_integer():
            return f"{int(v):,}"
        return f"{v:,.2f}"
    return str(value)


def _table(df: pd.DataFrame) -> dict[str, Any]:
    """JSON-safe table payload from a (small) DataFrame."""
    safe = df.head(_MAX_TABLE_ROWS).replace({np.nan: None})
    return {
        "columns": [str(c) for c in safe.columns],
        "rows": [
            {str(k): (None if pd.isna(v) else _py(v)) for k, v in row.items()}
            for row in safe.to_dict(orient="records")
        ],
    }


def _py(v: Any) -> Any:
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        f = float(v)
        return None if (np.isnan(f) or np.isinf(f)) else round(f, 4)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, pd.Timestamp):
        return v.isoformat()
    return v


def _corrections_note(u: Understanding) -> str:
    if not u.corrections:
        return ""
    parts = ", ".join(f"'{c['from']}' → **{c['to']}**" for c in u.corrections)
    return f"_I interpreted {parts}._\n\n"


# --- Individual answer builders ----------------------------------------------


def _answer_top_n(df: pd.DataFrame, u: Understanding) -> Answer | None:
    if not u.group_by or u.group_by not in df.columns:
        return None
    agg = u.agg
    if agg == "count" or not u.metric or u.metric not in df.columns:
        grouped = (
            df.groupby(u.group_by, dropna=True)
            .size()
            .rename("count")
            .reset_index()
        )
        value_col, agg_label = "count", "record count"
    else:
        grouped = (
            df.groupby(u.group_by, dropna=True)[u.metric]
            .agg(agg)
            .reset_index()
        )
        value_col = u.metric
        agg_label = f"{agg} of {u.metric}"

    grouped = grouped.sort_values(value_col, ascending=u.ascending).head(u.top_n)
    if grouped.empty:
        return None

    direction = "lowest" if u.ascending else "top"
    top_row = grouped.iloc[0]
    total = df[u.metric].sum() if (u.metric and u.metric in df.columns and agg == "sum") else None
    share = (
        f" — that is {top_row[value_col] / total * 100:.1f}% of the total"
        if total and total != 0
        else ""
    )

    content = (
        f"{_corrections_note(u)}"
        f"**What I found:** ranking **{u.group_by}** by {agg_label}, "
        f"**{top_row[u.group_by]}** leads with {_fmt(top_row[value_col])}{share}.\n\n"
        f"**Why it matters:** value is rarely evenly spread — the leaders here "
        f"disproportionately drive your total, so they deserve focused attention.\n\n"
        f"**Recommendation:** protect and grow the top {direction} performers, and "
        f"investigate whether the long tail can be consolidated or improved.\n\n"
        f"_Confidence: high — computed directly from {len(df):,} rows._"
    )

    chart = {
        "id": _new_id(),
        "type": "bar",
        "engine": "plotly",
        "title": f"{u.group_by} by {agg_label}",
        "columns": [u.group_by, value_col],
        "encoding": {"x": u.group_by, "y": value_col},
        "data": [
            {u.group_by: _py(r[u.group_by]), value_col: _py(r[value_col])}
            for _, r in grouped.iterrows()
        ],
        "summary": content,
    }
    payload = {"table": _table(grouped), "chart": chart}
    return content, payload


def _answer_aggregate(df: pd.DataFrame, u: Understanding) -> Answer | None:
    if not u.metric or u.metric not in df.columns:
        return None
    series = pd.to_numeric(df[u.metric], errors="coerce").dropna()
    if series.empty:
        return None

    if u.group_by and u.group_by in df.columns:
        return _answer_top_n(df, u)

    value = getattr(series, u.agg if u.agg != "count" else "count")()
    content = (
        f"{_corrections_note(u)}"
        f"**What I found:** the {u.agg} of **{u.metric}** across {len(series):,} "
        f"non-null values is **{_fmt(value)}**.\n\n"
        f"**Context:** it ranges from {_fmt(series.min())} to {_fmt(series.max())} "
        f"with a mean of {_fmt(series.mean())} and median of {_fmt(series.median())}.\n\n"
        f"**Recommendation:** if the mean and median differ a lot, the column is "
        f"skewed — prefer the median for a typical value.\n\n"
        f"_Confidence: high — computed directly from the data._"
    )
    payload = {
        "table": {
            "columns": ["metric", "value"],
            "rows": [
                {"metric": f"{u.agg}({u.metric})", "value": _py(value)},
                {"metric": "min", "value": _py(series.min())},
                {"metric": "max", "value": _py(series.max())},
                {"metric": "mean", "value": _py(series.mean())},
                {"metric": "median", "value": _py(series.median())},
            ],
        }
    }
    return content, payload


def _answer_describe(df: pd.DataFrame, u: Understanding) -> Answer:
    n_rows, n_cols = df.shape
    numeric = df.select_dtypes(include=[np.number])
    missing_total = int(df.isna().sum().sum())
    dup = int(df.duplicated().sum())
    content = (
        f"{_corrections_note(u)}"
        f"**Dataset overview:** {n_rows:,} rows × {n_cols} columns, "
        f"{len(numeric.columns)} numeric. There are {missing_total:,} missing "
        f"cells and {dup:,} duplicate rows.\n\n"
        f"**What this means:** this is enough data for reliable aggregation"
        + (" but the missing cells should be handled before modelling.\n\n" if missing_total else ".\n\n")
        + "**Recommendation:** start with the Data Profile tab for per-column "
        "quality, then ask me for the top drivers of your key metric.\n\n"
        f"_Confidence: high._"
    )
    head = df.head(_MAX_TABLE_ROWS)
    return content, {"table": _table(head)}


def _answer_correlation(df: pd.DataFrame, u: Understanding) -> Answer | None:
    numeric = df.select_dtypes(include=[np.number])
    if numeric.shape[1] < 2:
        return None
    corr = numeric.corr(numeric_only=True)
    pairs: list[tuple[str, str, float]] = []
    cols = list(corr.columns)
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            v = corr.iloc[i, j]
            if pd.notna(v):
                pairs.append((cols[i], cols[j], float(v)))
    if not pairs:
        return None
    pairs.sort(key=lambda p: abs(p[2]), reverse=True)
    top = pairs[:8]
    a, b, c = top[0]
    strength = "strong" if abs(c) >= 0.7 else "moderate" if abs(c) >= 0.4 else "weak"
    direction = "positive" if c >= 0 else "negative"
    content = (
        f"{_corrections_note(u)}"
        f"**What I found:** the strongest relationship is between **{a}** and "
        f"**{b}** (r = {c:.2f}), a {strength} {direction} correlation.\n\n"
        f"**Why it matters:** correlated features often share a driver; a {direction} "
        f"link means they move {'together' if c >= 0 else 'in opposite directions'}.\n\n"
        f"**Recommendation:** use one to help predict the other, but avoid putting "
        f"both into a linear model (multicollinearity inflates coefficients).\n\n"
        f"_Confidence: high — Pearson correlation over numeric columns._"
    )
    payload = {
        "table": {
            "columns": ["feature a", "feature b", "correlation"],
            "rows": [{"feature a": x, "feature b": y, "correlation": round(v, 3)} for x, y, v in top],
        }
    }
    return content, payload


def _answer_missing(df: pd.DataFrame, u: Understanding) -> Answer:
    miss = df.isna().sum()
    miss = miss[miss > 0].sort_values(ascending=False)
    if miss.empty:
        return (
            "**Good news:** there are no missing values in this dataset — every "
            "column is fully populated.\n\n_Confidence: high._",
            {},
        )
    pct = (miss / len(df) * 100).round(2)
    worst = miss.index[0]
    content = (
        f"{_corrections_note(u)}"
        f"**What I found:** {len(miss)} column(s) contain missing values. "
        f"**{worst}** is the worst at {pct.iloc[0]:.1f}% empty.\n\n"
        f"**Why it happens:** missingness usually comes from optional fields, "
        f"integration gaps, or changes in how data was collected over time.\n\n"
        f"**Recommendation:** impute low-missing numeric columns (median) and "
        f"categoricals (mode); consider dropping columns that are mostly empty. "
        f"You can do this in one click on the Data Cleaning tab.\n\n"
        f"_Confidence: high._"
    )
    payload = {
        "table": {
            "columns": ["column", "missing", "missing_pct"],
            "rows": [
                {"column": c, "missing": int(miss[c]), "missing_pct": float(pct[c])}
                for c in miss.index[:_MAX_TABLE_ROWS]
            ],
        }
    }
    return content, payload


def _answer_distribution(df: pd.DataFrame, u: Understanding) -> Answer | None:
    if not u.metric or u.metric not in df.columns:
        return None
    series = pd.to_numeric(df[u.metric], errors="coerce").dropna()
    if series.empty:
        return None
    counts, edges = np.histogram(series, bins=min(20, max(5, int(np.sqrt(len(series))))))
    data = [
        {"bin": f"{edges[i]:.1f}", "count": int(counts[i])} for i in range(len(counts))
    ]
    skew = float(series.skew())
    shape = (
        "right-skewed (a long tail of high values)"
        if skew > 0.5
        else "left-skewed (a long tail of low values)"
        if skew < -0.5
        else "roughly symmetric"
    )
    content = (
        f"{_corrections_note(u)}"
        f"**What I found:** **{u.metric}** is {shape} (skew = {skew:.2f}), "
        f"centred near {_fmt(series.median())}.\n\n"
        f"**Recommendation:** " + (
            "apply a log transform before modelling to reduce the skew.\n\n"
            if abs(skew) > 1
            else "the distribution is well-behaved for most models.\n\n"
        )
        + "_Confidence: high._"
    )
    chart = {
        "id": _new_id(),
        "type": "histogram",
        "engine": "plotly",
        "title": f"Distribution of {u.metric}",
        "column": u.metric,
        "encoding": {"x": "bin", "y": "count"},
        "data": data,
        "summary": content,
    }
    return content, {"chart": chart}


def _answer_trend(df: pd.DataFrame, u: Understanding) -> Answer | None:
    if not u.date_col or u.date_col not in df.columns or not u.metric:
        return None
    if u.metric not in df.columns:
        return None
    dates = pd.to_datetime(df[u.date_col], errors="coerce")
    tmp = pd.DataFrame({"period": dates, "value": pd.to_numeric(df[u.metric], errors="coerce")})
    tmp = tmp.dropna()
    if tmp.empty:
        return None
    tmp = tmp.set_index("period").resample("ME")["value"].agg(u.agg if u.agg != "count" else "sum")
    tmp = tmp.dropna()
    if len(tmp) < 2:
        return None
    first, last = tmp.iloc[0], tmp.iloc[-1]
    change = (last - first) / abs(first) * 100 if first else 0.0
    trend = "upward" if change > 2 else "downward" if change < -2 else "flat"
    content = (
        f"{_corrections_note(u)}"
        f"**What I found:** **{u.metric}** shows an overall **{trend}** trend, "
        f"changing {change:+.1f}% from the first to the last period.\n\n"
        f"**Why it matters:** the direction and volatility tell you whether recent "
        f"performance is sustainable or needs intervention.\n\n"
        f"**Recommendation:** decompose into trend + seasonality before forecasting; "
        f"a seasonal-naive baseline is a good starting point.\n\n"
        f"_Confidence: medium-high — monthly resample of {len(tmp)} periods._"
    )
    chart = {
        "id": _new_id(),
        "type": "line",
        "engine": "plotly",
        "title": f"{u.metric} over time",
        "encoding": {"x": "period", "y": "value"},
        "data": [
            {"period": idx.strftime("%Y-%m"), "value": _py(val)}
            for idx, val in tmp.items()
        ],
        "summary": content,
    }
    return content, {"chart": chart}


def _answer_sql(df: pd.DataFrame, u: Understanding) -> Answer:
    group = u.group_by or "group_column"
    metric = u.metric or "value_column"
    sql = (
        f"SELECT {group},\n"
        f"       COUNT(*)        AS records,\n"
        f"       SUM({metric})   AS total_{metric},\n"
        f"       AVG({metric})   AS avg_{metric}\n"
        f"FROM dataset\n"
        f"GROUP BY {group}\n"
        f"ORDER BY total_{metric} DESC\n"
        f"LIMIT {u.top_n};"
    )
    content = (
        f"{_corrections_note(u)}"
        f"Here is a query that summarises **{metric}** by **{group}**:\n\n"
        f"```sql\n{sql}\n```\n\n"
        f"_Adjust the column names if your schema differs. Confidence: high._"
    )
    return content, {"code": {"language": "sql", "content": sql}}


def _answer_python(df: pd.DataFrame, u: Understanding) -> Answer:
    group = u.group_by or (df.columns[0] if len(df.columns) else "group")
    metric = u.metric or "value"
    code = (
        "import pandas as pd\n\n"
        "# `df` is already loaded for you.\n"
        f"summary = (\n"
        f"    df.groupby({group!r})[{metric!r}]\n"
        f"      .agg(['count', 'sum', 'mean'])\n"
        f"      .sort_values('sum', ascending=False)\n"
        f"      .head({u.top_n})\n"
        f")\n"
        "print(summary)\n"
    )
    content = (
        f"{_corrections_note(u)}"
        f"Here's pandas to rank **{metric}** by **{group}**:\n\n"
        f"```python\n{code}```\n\n"
        f"_Runs against the `df` already loaded in the notebook. Confidence: high._"
    )
    return content, {"code": {"language": "python", "content": code}}


def _answer_diagnose(df: pd.DataFrame, u: Understanding, profile: dict) -> Answer:
    """Proactive investigation instead of generic advice."""
    findings: list[str] = []
    quality = profile.get("quality", {})
    summary = profile.get("dataset_summary", {})
    if summary.get("total_missing_cells"):
        findings.append(
            f"- **Missing data:** {summary['total_missing_cells']:,} empty cells can "
            "bias training — impute or drop before fitting."
        )
    if summary.get("duplicate_pct", 0) > 1:
        findings.append(
            f"- **Duplicates:** {summary['duplicate_pct']}% duplicate rows leak between "
            "train/test and inflate scores — de-duplicate first."
        )
    outlier_cols = [
        c["name"]
        for c in profile.get("columns", [])
        if c.get("stats", {}).get("outlier_pct", 0) >= 5
    ]
    if outlier_cols:
        findings.append(
            f"- **Outliers:** heavy tails in {', '.join(outlier_cols[:3])} distort "
            "distance-based and linear models — cap or transform them."
        )
    for tgt in profile.get("target_suggestions", []):
        col = next((c for c in profile.get("columns", []) if c["name"] == tgt["column"]), None)
        if col and col.get("top_values") and col["top_values"][0]["pct"] >= 80:
            findings.append(
                f"- **Class imbalance:** '{col['name']}' is {col['top_values'][0]['pct']}% "
                "one class — use class weights/resampling and judge on precision/recall."
            )
            break
    if not findings:
        findings.append(
            "- The obvious data-quality culprits look clean, so focus next on "
            "**feature leakage** (a feature that encodes the target) and **model "
            "choice** (try a gradient-boosted tree as a strong baseline)."
        )
    content = (
        f"{_corrections_note(u)}"
        "Let's investigate systematically rather than guess. Checking the usual "
        "causes of weak performance against **your** data:\n\n"
        + "\n".join(findings)
        + "\n\n**Next step:** fix the highest-severity item first, re-train, and "
        "compare — one issue often explains most of the gap.\n\n"
        "_Confidence: high — grounded in this dataset's profile._"
    )
    return content, {"checklist": findings}


def _answer_recommend_model(df: pd.DataFrame, u: Understanding, profile: dict) -> Answer:
    suggestions = profile.get("target_suggestions", [])
    if suggestions:
        tgt = suggestions[0]
        task = tgt["type"]
        models = (
            "Logistic Regression (baseline), Random Forest, and Gradient Boosting"
            if task == "classification"
            else "Linear Regression (baseline), Random Forest, and Gradient Boosting"
        )
        metric = (
            "F1 / ROC-AUC (not accuracy, if classes are imbalanced)"
            if task == "classification"
            else "RMSE and R²"
        )
        content = (
            f"{_corrections_note(u)}"
            f"**Likely task:** {task}, predicting **{tgt['column']}** "
            f"({tgt['reason'].lower()})\n\n"
            f"**Models to try:** {models}. Start simple, then let boosting compete.\n\n"
            f"**Evaluate with:** {metric}.\n\n"
            f"**Recommendation:** run *Predict Best Model* to train and rank these "
            f"automatically on your data.\n\n_Confidence: {tgt['confidence']:.0%}._"
        )
    else:
        content = (
            f"{_corrections_note(u)}"
            "I couldn't infer an obvious target column. Tell me what you want to "
            "predict, or run *Predict Best Model* and I'll detect the task type, "
            "train several models, and rank them for you.\n\n_Confidence: medium._"
        )
    return content, {}


def _answer_feature_engineering(df: pd.DataFrame, u: Understanding, profile: dict) -> Answer:
    """Suggest concrete feature-engineering moves grounded in the columns."""
    ideas: list[str] = []
    snippets: list[str] = []
    numeric = df.select_dtypes(include=[np.number]).columns.tolist()
    datetime_cols = [
        c["name"]
        for c in profile.get("columns", [])
        if c.get("semantic_type") == "datetime"
    ]
    cat_cols = [
        c["name"]
        for c in profile.get("columns", [])
        if c.get("semantic_type") in ("categorical", "boolean")
    ]

    if datetime_cols:
        col = datetime_cols[0]
        ideas.append(
            f"- **Calendar parts from `{col}`:** extract year, month, weekday and "
            "is-weekend — seasonality is often the strongest signal."
        )
        snippets.append(
            f"dt = pd.to_datetime(df[{col!r}], errors='coerce')\n"
            f"df['{col}_year'] = dt.dt.year\n"
            f"df['{col}_month'] = dt.dt.month\n"
            f"df['{col}_weekday'] = dt.dt.weekday\n"
            f"df['{col}_is_weekend'] = dt.dt.weekday.ge(5).astype(int)"
        )
    if len(numeric) >= 2:
        a, b = numeric[0], numeric[1]
        ideas.append(
            f"- **Ratio `{a} / {b}`:** ratios and differences capture interactions a "
            "model can't easily learn from raw columns."
        )
        snippets.append(f"df['{a}_per_{b}'] = df[{a!r}] / df[{b!r}].replace(0, np.nan)")
    skewed = [
        c["name"]
        for c in profile.get("columns", [])
        if abs(c.get("stats", {}).get("skew", 0) or 0) > 1
    ]
    if skewed:
        ideas.append(
            f"- **Log-transform {', '.join(skewed[:3])}:** compresses heavy tails so "
            "linear and distance-based models behave."
        )
        snippets.append(f"df['{skewed[0]}_log'] = np.log1p(df[{skewed[0]!r}].clip(lower=0))")
    high_card = [
        c["name"]
        for c in profile.get("columns", [])
        if c.get("semantic_type") in ("categorical", "text")
        and (c.get("stats", {}).get("unique", 0) or 0) > 20
    ]
    if high_card:
        ideas.append(
            f"- **Frequency-encode `{high_card[0]}`:** high-cardinality categories blow "
            "up one-hot encoding; encode by count/frequency instead."
        )
        snippets.append(
            f"freq = df[{high_card[0]!r}].value_counts(normalize=True)\n"
            f"df['{high_card[0]}_freq'] = df[{high_card[0]!r}].map(freq)"
        )
    elif cat_cols:
        ideas.append(
            f"- **One-hot encode `{cat_cols[0]}`:** low-cardinality categories are safe "
            "to expand into indicator columns."
        )
        snippets.append(f"df = pd.get_dummies(df, columns=[{cat_cols[0]!r}], drop_first=True)")

    if not ideas:
        ideas.append(
            "- Your columns are already fairly model-ready. Consider interaction terms "
            "between your strongest predictors and the target."
        )

    code = "import numpy as np\nimport pandas as pd\n\n# `df` is already loaded.\n" + "\n".join(snippets)
    content = (
        f"{_corrections_note(u)}"
        "**Feature-engineering ideas grounded in your columns:**\n\n"
        + "\n".join(ideas)
        + "\n\n**Recommendation:** add a couple of these, re-train in Model Studio, and "
        "keep the features that move the metric.\n\n_Confidence: high — based on your "
        "actual column types and distributions._"
    )
    payload: dict[str, Any] = {"checklist": ideas}
    if snippets:
        payload["code"] = {"language": "python", "content": code}
    return content, payload


def _answer_cleaning(df: pd.DataFrame, u: Understanding, profile: dict) -> Answer:
    """Recommend a prioritised cleaning plan grounded in the profile."""
    steps: list[str] = []
    summary = profile.get("dataset_summary", {})
    miss = df.isna().sum()
    miss = miss[miss > 0].sort_values(ascending=False)
    if not miss.empty:
        worst = miss.index[0]
        pct = miss.iloc[0] / len(df) * 100
        steps.append(
            f"- **Missing values:** `{worst}` is {pct:.1f}% empty. Impute numeric with "
            "the median and categoricals with the mode; drop columns above ~60% empty."
        )
    if summary.get("duplicate_pct", 0) > 0:
        steps.append(
            f"- **Duplicates:** {summary['duplicate_pct']}% of rows are duplicated — "
            "drop exact duplicates so they don't bias aggregates and models."
        )
    outlier_cols = [
        c["name"]
        for c in profile.get("columns", [])
        if c.get("stats", {}).get("outlier_pct", 0) >= 5
    ]
    if outlier_cols:
        steps.append(
            f"- **Outliers:** {', '.join(outlier_cols[:3])} carry heavy tails — cap at the "
            "1st/99th percentile or transform before distance-based models."
        )
    text_cols = [
        c["name"]
        for c in profile.get("columns", [])
        if c.get("semantic_type") in ("categorical", "text")
    ]
    if text_cols:
        steps.append(
            f"- **Text consistency:** trim whitespace and standardise case on "
            f"{', '.join(text_cols[:3])} so 'US' and 'us ' aren't treated as different."
        )
    if not steps:
        steps.append(
            "- No major quality issues stand out — spot-check dtypes and unit consistency, "
            "then you're ready to model."
        )
    content = (
        f"{_corrections_note(u)}"
        "**A prioritised cleaning plan for this dataset:**\n\n"
        + "\n".join(steps)
        + "\n\n**Recommendation:** the Data Cleaning tab applies most of these in one "
        "click. Fix the highest-impact issue first, then re-profile.\n\n"
        "_Confidence: high — grounded in this dataset's profile._"
    )
    return content, {"checklist": steps}


_STAT_GLOSSARY: dict[str, tuple[tuple[str, ...], str]] = {
    "mean": (("mean", "average", "avg"), "The **mean** is the arithmetic average — the sum divided by the count. It is sensitive to outliers, so a few extreme values pull it away from the typical case."),
    "median": (("median",), "The **median** is the middle value when the data is sorted. Unlike the mean it ignores how extreme the outliers are, so it's the better 'typical value' for skewed data."),
    "std": (("std", "standard deviation", "deviation"), "**Standard deviation** measures spread around the mean in the same units as the data. Larger means more variability; ~68% of normal data sits within one std of the mean."),
    "variance": (("variance",), "**Variance** is the average squared distance from the mean (standard deviation squared). It's in squared units, which is why std is usually reported instead."),
    "correlation": (("correlation", "correlat", "pearson", "r value"), "**Correlation (r)** ranges from -1 to +1 and measures how linearly two variables move together. Near 0 means no linear link; it does *not* imply causation."),
    "skew": (("skew", "skewness"), "**Skew** measures asymmetry. Positive skew has a long right tail (a few large values); negative skew a long left tail. |skew| > 1 usually warrants a transform."),
    "percentile": (("percentile", "quantile", "quartile"), "A **percentile** is the value below which that % of observations fall — the 90th percentile is exceeded by only 10% of rows. Quartiles are the 25/50/75th percentiles."),
    "iqr": (("iqr", "interquartile"), "The **IQR** is the range between the 25th and 75th percentiles — the middle 50% of the data. It's a robust spread measure and the basis of the standard outlier rule."),
    "pvalue": (("p-value", "p value", "pvalue", "significance"), "A **p-value** is the probability of seeing a result at least this extreme if there were truly no effect. Small (<0.05) suggests the pattern is unlikely to be chance alone."),
    "outlier": (("outlier", "anomaly"), "An **outlier** is a value far from the rest, commonly flagged when it sits beyond 1.5×IQR from the quartiles. Investigate before deleting — it may be a real, important case."),
    "distribution": (("distribution", "histogram"), "A **distribution** describes how often each value (or range) occurs. Its shape — symmetric, skewed, bimodal — guides which summary statistic and model to use."),
}


def _answer_explain_stat(df: pd.DataFrame, u: Understanding, profile: dict) -> Answer | None:
    """Explain a statistical concept, grounding it in the dataset when possible."""
    q = u.corrected.lower()
    hit: tuple[str, str] | None = None
    for key, (surfaces, text) in _STAT_GLOSSARY.items():
        if any(s in q for s in surfaces):
            hit = (key, text)
            break
    if hit is None:
        return None
    key, explanation = hit
    grounding = ""
    if u.metric and u.metric in df.columns:
        series = pd.to_numeric(df[u.metric], errors="coerce").dropna()
        if not series.empty:
            if key == "mean":
                grounding = f"\n\nFor **{u.metric}** here, the mean is {_fmt(series.mean())} (median {_fmt(series.median())})."
            elif key == "median":
                grounding = f"\n\nFor **{u.metric}** here, the median is {_fmt(series.median())} vs a mean of {_fmt(series.mean())}."
            elif key in ("std", "variance"):
                grounding = f"\n\n**{u.metric}** has a standard deviation of {_fmt(series.std())} around a mean of {_fmt(series.mean())}."
            elif key == "skew":
                grounding = f"\n\n**{u.metric}** has a skew of {series.skew():.2f}."
    content = (
        f"{_corrections_note(u)}{explanation}{grounding}\n\n_Confidence: high._"
    )
    return content, {}


# --- Dispatcher ---------------------------------------------------------------


def assist_code(
    df: pd.DataFrame,
    prompt: str,
    profile: dict,
    error: str | None = None,
) -> str:
    """Generate (or fix) a notebook Python snippet from a natural-language prompt.

    Reuses the deterministic analyst understanding so the notebook's AI assist
    stays offline and grounded in the real columns. When ``error`` is supplied
    the generated snippet is prefixed with a short fix note.
    """
    from app.services.ai.nlp import understand

    u = understand(prompt or "", profile or {})
    _, payload = _answer_python(df, u)
    code = payload.get("code", {}).get("content", "")
    if error:
        header = (
            "# The previous cell failed with:\n"
            f"# {error.strip().splitlines()[-1][:200]}\n"
            "# Suggested fix / rewrite below — review before running.\n\n"
        )
        code = header + code
    return code


def try_answer(df: pd.DataFrame, u: Understanding, profile: dict) -> Answer | None:
    """Route to the right computed answer. Returns None if data can't answer it."""
    intent = u.intent
    try:
        if intent == "top_n":
            return _answer_top_n(df, u) or _answer_aggregate(df, u)
        if intent == "aggregate":
            return _answer_aggregate(df, u) or _answer_top_n(df, u)
        if intent == "describe":
            return _answer_describe(df, u)
        if intent == "correlation":
            return _answer_correlation(df, u)
        if intent == "missing":
            return _answer_missing(df, u)
        if intent == "distribution":
            return _answer_distribution(df, u)
        if intent == "trend":
            return _answer_trend(df, u) or _answer_aggregate(df, u)
        if intent == "sql":
            return _answer_sql(df, u)
        if intent == "python":
            return _answer_python(df, u)
        if intent == "diagnose":
            return _answer_diagnose(df, u, profile)
        if intent == "recommend_model":
            return _answer_recommend_model(df, u, profile)
        if intent == "feature_engineering":
            return _answer_feature_engineering(df, u, profile)
        if intent == "cleaning":
            return _answer_cleaning(df, u, profile)
        if intent == "explain_stat":
            return _answer_explain_stat(df, u, profile)
    except Exception:  # noqa: BLE001 - never fail the chat because of a compute error
        return None
    return None
