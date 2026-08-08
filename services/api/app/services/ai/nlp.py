"""Lightweight natural-language understanding for the dataset chat.

Fully offline and dependency-free (uses :mod:`difflib`). It gives the chat three
capabilities that make it feel like an expert assistant rather than a keyword
bot:

* **Spelling correction** grounded in the dataset's own column names plus a
  small domain vocabulary ("slaes" -> "sales", "revnue" -> "revenue"). We never
  ask the user to fix typos; we silently map them and report what we assumed.
* **Intent detection** over natural language and abbreviations ("show top
  products", "best selling items", "highest revenue" all map to a ranking
  intent).
* **Entity resolution** that links words in the question to real columns so the
  Analyst can compute a genuine answer.

All functions are pure and deterministic so the behaviour is testable.
"""
from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from typing import Literal

Intent = Literal[
    "top_n",
    "aggregate",
    "describe",
    "correlation",
    "missing",
    "distribution",
    "trend",
    "sql",
    "python",
    "diagnose",
    "recommend_model",
    "feature_engineering",
    "cleaning",
    "explain_stat",
    "app_help",
    "general",
]

# Domain vocabulary used both for typo correction and for synonym expansion.
# Keys are canonical concepts; values are surface forms that map to them.
_SYNONYMS: dict[str, tuple[str, ...]] = {
    "revenue": ("revenue", "revenues", "rev", "turnover", "income", "earnings"),
    "sales": ("sales", "sale", "sold", "selling", "sell"),
    "amount": ("amount", "amt", "value", "total", "spend", "spending"),
    "profit": ("profit", "margin", "profits", "earnings"),
    "price": ("price", "prices", "cost", "unitprice"),
    "quantity": ("quantity", "qty", "units", "count", "volume"),
    "customer": ("customer", "customers", "client", "clients", "buyer", "user", "users"),
    "product": ("product", "products", "item", "items", "sku", "goods"),
    "region": ("region", "regions", "area", "territory", "location", "geo"),
    "category": ("category", "categories", "segment", "segments", "type", "group"),
    "date": ("date", "day", "time", "period", "month", "year", "timestamp"),
    "order": ("order", "orders", "transaction", "transactions", "purchase"),
}

# Flattened correction vocabulary (canonical + common misspellings).
_DOMAIN_WORDS: set[str] = set()
for _canon, _forms in _SYNONYMS.items():
    _DOMAIN_WORDS.add(_canon)
    _DOMAIN_WORDS.update(_forms)

# Common analytics-verb misspellings that shouldn't be treated as columns.
_STOPWORDS = {
    "the", "a", "an", "of", "for", "to", "in", "on", "by", "and", "or", "is",
    "are", "what", "which", "show", "me", "my", "give", "list", "top", "best",
    "highest", "lowest", "most", "least", "biggest", "largest", "smallest",
    "how", "many", "much", "average", "avg", "mean", "sum", "total", "count",
    "per", "each", "group", "with", "that", "this", "it", "do", "does", "can",
    "you", "please", "about", "from", "get", "find", "all", "any",
}

_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9_]*")


@dataclass
class Understanding:
    """The parsed understanding of a user question."""

    original: str
    corrected: str
    corrections: list[dict[str, str]] = field(default_factory=list)
    intent: Intent = "general"
    metric: str | None = None  # a numeric column to aggregate
    group_by: str | None = None  # a categorical column to group on
    date_col: str | None = None
    columns: list[str] = field(default_factory=list)  # any referenced columns
    top_n: int = 10
    agg: str = "sum"  # sum | mean | count | min | max
    ascending: bool = False
    # Conversation memory: set when this turn resolved a pronoun ("them", "it")
    # against the previous turn. ``reference`` is the prior subject it points to.
    followup: bool = False
    reference: str | None = None

    def as_dict(self) -> dict:
        return {
            "corrections": self.corrections,
            "intent": self.intent,
            "metric": self.metric,
            "group_by": self.group_by,
            "date_col": self.date_col,
            "columns": self.columns,
            "top_n": self.top_n,
            "agg": self.agg,
            "ascending": self.ascending,
            "followup": self.followup,
            "reference": self.reference,
        }


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def correct_spelling(
    question: str, columns: list[str]
) -> tuple[str, list[dict[str, str]]]:
    """Fuzzy-correct tokens against column names + domain vocabulary.

    Returns the corrected question and a list of ``{"from", "to"}`` corrections.
    Only high-confidence single-word corrections are applied so we never distort
    the user's meaning.
    """
    # Build the correction dictionary: column tokens + known domain words.
    col_tokens: set[str] = set()
    for col in columns:
        for tok in _tokenize(col):
            if len(tok) >= 3:
                col_tokens.add(tok)
    vocabulary = sorted(col_tokens | _DOMAIN_WORDS)

    corrections: list[dict[str, str]] = []
    seen: set[str] = set()

    def _replace(match: re.Match[str]) -> str:
        word = match.group(0)
        low = word.lower()
        if len(low) < 4 or low in _STOPWORDS or low in vocabulary:
            return word
        # Already a valid token (matches a column or domain word) -> keep.
        best = difflib.get_close_matches(low, vocabulary, n=1, cutoff=0.82)
        if not best or best[0] == low:
            return word
        target = best[0]
        if low not in seen:
            corrections.append({"from": word, "to": target})
            seen.add(low)
        # Preserve capitalisation of the original first letter.
        return target.capitalize() if word[0].isupper() else target

    corrected = _TOKEN_RE.sub(_replace, question)
    return corrected, corrections


def _resolve_column(token: str, columns: list[str]) -> str | None:
    """Map a single token to the closest real column name."""
    lower_map = {c.lower(): c for c in columns}
    if token in lower_map:
        return lower_map[token]
    # Expand synonyms: if the token is a known concept, try its surface forms.
    candidates = [token]
    for canon, forms in _SYNONYMS.items():
        if token == canon or token in forms:
            candidates.extend([canon, *forms])
    for cand in candidates:
        for low, original in lower_map.items():
            if cand == low or cand in low or low in cand:
                return original
    match = difflib.get_close_matches(token, list(lower_map), n=1, cutoff=0.8)
    return lower_map[match[0]] if match else None


def _detect_intent(q: str) -> Intent:
    # Navigation / "where is X" style questions -> product help. Kept narrow so
    # it never shadows data questions ("which columns have missing values").
    if re.search(
        r"where is|where's|where can i find|which tab|which page|which menu|"
        r"how do i (open|use|get to|navigate|find|access)|how to (open|use|find|access)|"
        r"take me to|navigate to|what does the .* (tab|page|button) do|explain the .* (tab|page)",
        q,
    ):
        return "app_help"
    if re.search(r"\bsql\b|\bquery\b", q):
        return "sql"
    if re.search(r"\bpython\b|\bpandas\b|\bcode\b|\bscript\b", q):
        return "python"
    if re.search(r"missing|null|nan|empty|incomplete", q):
        return "missing"
    if re.search(r"correlat|relationship|related|associat|driver", q):
        return "correlation"
    if re.search(r"distribut|spread|histogram|range of", q):
        return "distribution"
    if re.search(r"trend|over time|by month|by year|time series|forecast|growth", q):
        return "trend"
    if re.search(r"why|declin|drop|decrease|increase|diagnos|root cause|accuracy is low|low accuracy", q):
        return "diagnose"
    if re.search(r"feature engineer|new feature|create.*feature|derive.*feature|feature idea|engineer.*feature|feature to (add|create)", q):
        return "feature_engineering"
    if re.search(r"\bclean\b|cleanse|cleaning|preprocess|prepare the data|wrangl|tidy|fix the data|prep the data", q):
        return "cleaning"
    if re.search(r"which model|what model|recommend.*model|best model|predict|classif|regress", q):
        return "recommend_model"
    if re.search(r"explain|meaning of|definition of|interpret|how do i read|what does .* mean|what is a |what is an ", q):
        return "explain_stat"
    if re.search(r"\btop\b|best|highest|largest|biggest|most|ranking|rank|leading|worst|lowest|smallest|least", q):
        return "top_n"
    if re.search(r"average|avg|mean|sum|total|count|how many|how much|per |by ", q):
        return "aggregate"
    if re.search(r"describe|summary|summarise|summarize|overview|profile|statistics|stats|tell me about", q):
        return "describe"
    return "general"


# Pronouns / back-references that signal a follow-up bound to the previous turn.
_PRONOUN_RE = re.compile(
    r"\b(them|they|it|its|that|those|these|this one|the same|the model|"
    r"the result|the results|the chart|the plot|the feature)\b"
)


def _last_user_message(history: list[dict[str, str]] | None) -> str:
    """Most recent user turn in the conversation (empty string if none)."""
    for turn in reversed(history or []):
        if turn.get("role") == "user" and turn.get("content"):
            return turn["content"]
    return ""


def understand(
    question: str,
    profile: dict,
    history: list[dict[str, str]] | None = None,
) -> Understanding:
    """Parse a question into a structured :class:`Understanding`.

    ``history`` enables conversation memory: a follow-up like "should I remove
    them?" or "can you improve it?" is resolved against the previous user turn so
    the pronoun keeps its meaning ("them" = missing values, "it" = the model).
    Conversation memory is only ever the history passed in, which the caller
    scopes to the active dataset — nothing leaks across datasets.
    """
    columns_meta = profile.get("columns", [])
    columns = [c["name"] for c in columns_meta]
    numeric_cols = [c["name"] for c in columns_meta if c.get("semantic_type") == "numeric"]
    cat_cols = [
        c["name"]
        for c in columns_meta
        if c.get("semantic_type") in ("categorical", "boolean", "text")
    ]
    date_cols = [c["name"] for c in columns_meta if c.get("semantic_type") == "datetime"]

    corrected, corrections = correct_spelling(question, columns)
    q = corrected.lower()
    intent = _detect_intent(q)

    # --- Conversation memory -------------------------------------------------
    # If this turn is a pronoun follow-up, borrow the previous turn's subject so
    # intent + column resolution stay anchored to what "them"/"it" refers to.
    followup = False
    reference: str | None = None
    resolution_text = corrected
    prev = _last_user_message(history)
    if prev and _PRONOUN_RE.search(q):
        followup = True
        reference = prev.strip()
        prev_intent = _detect_intent(prev.lower())
        if intent == "general" and prev_intent != "general":
            intent = prev_intent
        # Resolve columns over the combined text so the prior subject survives.
        resolution_text = f"{prev} {corrected}"

    u = Understanding(
        original=question,
        corrected=corrected,
        corrections=corrections,
        intent=intent,
        followup=followup,
        reference=reference,
    )

    # Ranking direction / count.
    u.ascending = bool(re.search(r"worst|lowest|smallest|least|bottom", q))
    m = re.search(r"top\s+(\d{1,3})|(\d{1,3})\s+(?:top|best|highest)", q)
    if m:
        u.top_n = int(m.group(1) or m.group(2))

    # Aggregation verb.
    if re.search(r"\baverage\b|\bavg\b|\bmean\b", q):
        u.agg = "mean"
    elif re.search(r"\bcount\b|how many|number of", q):
        u.agg = "count"
    elif re.search(r"\bmax\b|maximum|highest value", q):
        u.agg = "max"
    elif re.search(r"\bmin\b|minimum|lowest value", q):
        u.agg = "min"
    else:
        u.agg = "sum"

    # Resolve referenced columns from tokens (preserve order, dedupe). For a
    # follow-up this scans the previous subject too, so "them" keeps its columns.
    referenced: list[str] = []
    for tok in _tokenize(resolution_text):
        if tok in _STOPWORDS or len(tok) < 3:
            continue
        col = _resolve_column(tok, columns)
        if col and col not in referenced:
            referenced.append(col)
    u.columns = referenced

    # Pick metric (numeric) and group (categorical).
    u.metric = next((c for c in referenced if c in numeric_cols), None)
    u.group_by = next((c for c in referenced if c in cat_cols), None)
    u.date_col = next((c for c in referenced if c in date_cols), None) or (
        date_cols[0] if date_cols and intent == "trend" else None
    )

    # Sensible fallbacks so a bare "show top products" still works.
    if u.metric is None and numeric_cols:
        u.metric = _best_metric(numeric_cols)
    if u.group_by is None and cat_cols:
        u.group_by = _best_group(cat_cols)

    return u


def _best_metric(numeric_cols: list[str]) -> str:
    priority = ("revenue", "sales", "amount", "profit", "total", "price", "value")
    for key in priority:
        for c in numeric_cols:
            if key in c.lower():
                return c
    return numeric_cols[0]


def _best_group(cat_cols: list[str]) -> str:
    priority = ("product", "category", "region", "segment", "customer", "type")
    for key in priority:
        for c in cat_cols:
            if key in c.lower():
                return c
    return cat_cols[0]
