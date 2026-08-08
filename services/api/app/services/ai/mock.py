"""Deterministic, offline mock LLM provider.

Produces plausible, dataset-aware responses without any network calls, so the
full product experience works with no credentials. It performs lightweight
intent routing over the user's question and grounds answers in the profile
context passed in the system message.
"""
from __future__ import annotations

import re

from app.services.ai.base import ChatTurn, LLMProvider


class MockProvider(LLMProvider):
    name = "mock"

    def complete(self, messages: list[ChatTurn], *, temperature: float = 0.2) -> str:
        user_msg = next((m.content for m in reversed(messages) if m.role == "user"), "")
        context = next((m.content for m in messages if m.role == "system"), "")
        return self._route(user_msg, context)

    def _route(self, question: str, context: str) -> str:
        q = question.lower()
        cols = self._columns_from_context(context)

        if any(k in q for k in ("sql", "query")):
            return self._sql(cols)
        if "python" in q or "pandas" in q or "code" in q:
            return self._python(cols)
        if any(k in q for k in ("predict", "forecast", "next month", "future")):
            return self._forecast()
        if any(k in q for k in ("valuable", "best customer", "top customer", "segment")):
            return self._valuable_customers(cols)
        if any(k in q for k in ("why", "decrease", "declin", "drop", "increase", "trend")):
            return self._diagnose()
        if any(k in q for k in ("chart", "plot", "visual", "graph")):
            return self._explain_charts()

        return (
            "Here is what I can tell from this dataset:\n\n"
            f"- It contains the columns: {', '.join(cols[:8]) or 'n/a'}.\n"
            "- Ask me to explain a trend ('why did revenue drop?'), find your most "
            "valuable customers, generate SQL or Python, or forecast next period.\n\n"
            "Every answer I give includes what I found, why it likely happened, a "
            "recommendation, and a confidence level."
        )

    @staticmethod
    def _columns_from_context(context: str) -> list[str]:
        m = re.search(r"columns:\s*(.+)", context, flags=re.IGNORECASE)
        if not m:
            return []
        return [c.strip() for c in m.group(1).split(",") if c.strip()][:20]

    @staticmethod
    def _sql(cols: list[str]) -> str:
        col = next((c for c in cols if c.lower() in ("revenue", "sales", "amount")), None)
        group = next((c for c in cols if c.lower() in ("region", "category", "segment")), "region")
        metric = col or "amount"
        return (
            "Here is a query to summarise the metric by group:\n\n"
            "```sql\n"
            f"SELECT {group},\n"
            f"       COUNT(*)          AS records,\n"
            f"       SUM({metric})     AS total_{metric},\n"
            f"       AVG({metric})     AS avg_{metric}\n"
            "FROM dataset\n"
            f"GROUP BY {group}\n"
            f"ORDER BY total_{metric} DESC;\n"
            "```\n\n"
            "Confidence: high. Adjust the column names if your schema differs."
        )

    @staticmethod
    def _python(cols: list[str]) -> str:
        return (
            "```python\n"
            "import pandas as pd\n\n"
            "df = pd.read_csv('data.csv')\n"
            "# Quick health check\n"
            "print(df.describe(include='all'))\n"
            "print(df.isna().mean().sort_values(ascending=False))\n"
            "```\n\n"
            "This profiles distributions and missingness. Confidence: high."
        )

    @staticmethod
    def _forecast() -> str:
        return (
            "**What I found:** the series shows a repeating monthly pattern with a mild "
            "underlying trend.\n\n"
            "**Approach:** a seasonal-naive baseline plus linear trend gives a defensible "
            "next-period estimate; upgrade to Prophet/ARIMA for production.\n\n"
            "**Recommendation:** plan around the projected value but hold a +/-12% buffer.\n\n"
            "**Confidence:** medium (0.6) - limited history increases uncertainty."
        )

    @staticmethod
    def _valuable_customers(cols: list[str]) -> str:
        return (
            "**What I found:** value is concentrated - a small share of customers drives "
            "most revenue (a classic Pareto pattern).\n\n"
            "**Why:** repeat purchasers and high-tier segments compound over time.\n\n"
            "**Recommendation:** rank customers by total spend x frequency (an RFM-style "
            "score) and protect the top decile with retention offers.\n\n"
            "**Business impact:** retaining the top 10% typically preserves 40-60% of revenue.\n\n"
            "**Confidence:** medium-high (0.7)."
        )

    @staticmethod
    def _diagnose() -> str:
        return (
            "**What I found:** the metric moved outside its normal range in the most recent "
            "periods.\n\n"
            "**Why it likely happened:** the shift aligns with a change in mix (region or "
            "category) rather than an across-the-board decline.\n\n"
            "**Recommendation:** segment the metric by your top categorical driver and compare "
            "period-over-period to isolate the contributor.\n\n"
            "**Business impact:** targeting the specific segment is far cheaper than a broad "
            "response.\n\n"
            "**Confidence:** medium (0.65)."
        )

    @staticmethod
    def _explain_charts() -> str:
        return (
            "Each chart is annotated: histograms show distribution shape and skew, box plots "
            "flag outliers, scatter plots quantify relationships, and the heatmap surfaces the "
            "strongest correlations. Tell me which chart to dig into. Confidence: high."
        )
