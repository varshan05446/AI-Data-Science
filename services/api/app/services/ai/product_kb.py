"""Shared product knowledge base for BOTH AI assistants.

This module is the SINGLE SOURCE OF TRUTH for everything about the application
UI, pages, buttons, menus, navigation, features and workflows. It contains
**no** dataset data whatsoever — only knowledge about the software.

Both assistants import from here so their understanding of the product never
drifts apart:

* The **AI Copilot** (product guide) uses it for its entire knowledge and for
  the LLM system prompt. It has ZERO access to anything else.
* The **Data Scientist AI** uses it *in addition to* the active dataset, so it
  can also answer "where is Model Studio?" style navigation questions.

Everything here is deterministic and offline so behaviour is fully testable.
"""
from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# The application map — kept in sync with the real UI (apps/web)
# ---------------------------------------------------------------------------
# Sidebar groups (components/layout/sidebar.tsx):
#   WORKSPACE:      Projects, Datasets, AI Insights, Reports
#   ANALYSIS:       Explore, Data Cleaning, Feature Engineering, Models, Experiments
#   TOOLS:          SQL Editor, Python Notebook
#   ADMINISTRATION: Team, API Keys, Settings
# Dataset workspace (datasets/[id]) has exactly 8 tabs.

APP_MAP = """== APPLICATION MAP ==

SIDEBAR NAVIGATION (grouped):
- WORKSPACE
  - Projects        /projects   — create/manage projects; each project holds datasets
  - Datasets        /datasets   — every dataset across your projects
  - AI Insights     /insights   — AI-explained findings across your data
  - Reports         /reports    — executive, business and technical reports
- ANALYSIS
  - Explore         — interactive charts (opens a dataset's Explore tab)
  - Data Cleaning   — cleaning workspace (opens a dataset's Cleaning tab)
  - Feature Engineering  /feature-engineering — build & manage derived features
  - Models          — AutoML training (opens a dataset's Model Studio tab)
  - Experiments     /experiments — track and compare training experiments
- TOOLS
  - SQL Editor      /sql-editor — run SQL over your datasets (DuckDB)
  - Python Notebook — notebook (opens a dataset's Notebook tab)
- ADMINISTRATION
  - Team            /team       — invite members, assign roles
  - API Keys        /api-keys   — generate keys for programmatic access
  - Settings        /settings   — profile, role view, appearance theme

DATASET WORKSPACE (/datasets/[id]) — 8 TABS, in order:
1. Data Profile   — auto data-quality report: rows, columns, missing, duplicates,
                    quality score (0-100, grade A-F), column types, sample rows,
                    suggested target columns
2. Data Cleaning  — fill missing, drop/rename columns, deduplicate, cap outliers,
                    encode categories; undo/redo, save versions, commit
3. Explore        — interactive chart builder + AI-generated EDA charts
                    (histograms, box plots, scatter, correlation heatmap)
4. Model Studio   — guided AutoML: Analyze -> Objective -> Train -> Report;
                    Beginner and Advanced modes; leaderboard, best model, playground
5. AI Insights    — structured findings: what / why / recommendation / business
                    impact / confidence, plus executive summary and next steps
6. Notebook       — Python scratchpad; df pre-loaded; pandas/numpy/matplotlib/
                    seaborn/plotly/sklearn; AI Assist generates code; variable explorer
7. Reports        — generate & export Executive / Business / Technical reports
8. Chat           — the Data Scientist AI, grounded in THIS dataset only

TOPBAR:
- Search / Command Palette  — Ctrl+K (or Cmd+K), or the Search button
- Role Switcher             — preview UI as Owner / Data Scientist / Analyst /
                              Executive / Business User
- Theme Toggle              — light / dark / system
- User Avatar               — profile, sign out

ROLE VIEW (Settings, UI depth only — not permissions):
- Owner / Data Scientist / Analyst -> full technical detail
- Executive / Business User        -> plain-English summaries, raw numbers hidden

RECOMMENDED WORKFLOW:
Projects -> Upload dataset -> Data Profile -> AI Insights -> Data Cleaning ->
Explore -> Model Studio -> Chat (Data Scientist AI) -> Reports
"""


# ---------------------------------------------------------------------------
# Handoff detection — questions that require the user's actual data
# ---------------------------------------------------------------------------
# When the Copilot sees one of these it must NOT answer; it hands off to the
# Data Scientist AI. The Copilot never touches data, never guesses, never
# fabricates.

_DATA_QUESTION_SIGNALS: tuple[str, ...] = (
    "my dataset", "my data", "this dataset", "the dataset", "my columns",
    "which column", "what column", "missing value", "outlier", "duplicate row",
    "correlation", "correlate", "distribution of", "mean of", "average of",
    "median of", "sum of", "count of", "how many rows", "rows in my",
    "accuracy", "my accuracy", "f1", "roc", "rmse", "r2", "r squared",
    "model result", "model results", "prediction", "predict ", "feature importance",
    "explain this chart", "explain this correlation", "why is my", "why are my",
    "build a model", "build me a model", "train a model", "improve it",
    "improve my model", "improve the model", "generate python", "generate sql",
    "generate pandas", "write python", "write sql", "analyse my", "analyze my",
    "explain my", "summarise my data", "summarize my data", "find outliers",
    "which method is best for my", "best for my dataset", "clean my data",
    "remove them", "should i remove", "what should i predict",
)


def is_data_question(question: str) -> bool:
    """True when a question needs the user's actual data (Copilot must hand off).

    Navigation / how-to phrasing ("how do I train a model?", "where is X?") is
    product guidance the Copilot answers itself — even when it mentions a data
    word — so it is never treated as a data question. Imperative requests to
    analyse data ("build me a model", "which method is best for my dataset") do
    hand off.
    """
    q = (question or "").lower()
    if re.search(
        r"\bhow do i\b|\bhow can i\b|\bhow to\b|\bwhere is\b|\bwhere's\b|"
        r"\bwhere can i\b|\bwhich (tab|page|menu|button)\b|\bwhat does the\b|"
        r"\bexplain the .* (tab|page)\b|\bnavigate\b",
        q,
    ):
        return False
    return any(sig in q for sig in _DATA_QUESTION_SIGNALS)


# ---------------------------------------------------------------------------
# System prompts (used only when a real LLM provider is configured)
# ---------------------------------------------------------------------------

def copilot_system_prompt() -> str:
    """Product-only system prompt for the AI Copilot.

    Personality: friendly, welcoming, short, a guide/teacher/navigator. It knows
    the software perfectly and NOTHING about the user's data.
    """
    return (
        "You are the DataMind AI Copilot — the friendly Product Guide, Onboarding "
        "Assistant and UI Navigator. You know every page, button, menu, workflow "
        "and feature of the platform. Be warm, welcoming and concise: short "
        "answers, numbered steps, tell users exactly where to click.\n\n"
        "STRICT BOUNDARY: You have ZERO access to any user data. You must NEVER "
        "reference, infer, compute or discuss datasets, dataset contents, columns, "
        "statistics, missing values, outliers, correlations, notebook variables, "
        "Python execution, model results, predictions, charts built from data, or "
        "anything derived from the user's data. NEVER guess and NEVER fabricate. "
        "If a question requires analysing the user's data, do NOT answer it — "
        "politely explain it needs the user's dataset and hand off to the Data "
        "Scientist AI (the Chat tab inside the dataset), which has secure, isolated "
        "access.\n\n" + APP_MAP
    )


def ds_app_grounding() -> str:
    """Compact app knowledge appended to the Data Scientist AI's prompt.

    The Data Scientist AI shares the product knowledge so it can also answer
    navigation questions ("where is Model Studio?"), on top of its data access.
    """
    return (
        "You also know the application UI and can answer navigation questions.\n"
        + APP_MAP
    )


# ---------------------------------------------------------------------------
# Deterministic app-help router (offline; used by both assistants)
# ---------------------------------------------------------------------------
# Each entry: (keywords, answer). First match wins, so order from specific to
# general. Returns None when the question isn't about using the app, letting the
# caller fall back (Copilot -> generic greeting; Data Scientist AI -> data path).

_HELP_ROUTES: list[tuple[tuple[str, ...], str]] = [
    (
        ("upload", "add dataset", "import data", "add data", "new dataset"),
        "**Uploading a dataset:**\n\n"
        "1. Open **Projects** in the sidebar\n"
        "2. Open or create a project\n"
        "3. Click **Upload dataset** (top right)\n"
        "4. Choose a CSV, Excel (.xlsx) or JSON file\n"
        "5. It profiles automatically — status goes `uploaded → profiling → ready`\n"
        "6. Click the dataset name to open its workspace ✅",
    ),
    (
        ("create project", "new project", "make a project", "start a project"),
        "**Creating a project:**\n\n"
        "1. Open **Projects** in the sidebar → click **New project**\n"
        "2. Fill in name, business domain, description and goals "
        "(goals help the AI give sharper insights)\n"
        "3. Click **Create**, then **Upload dataset** inside it.\n\n"
        "Each project can hold multiple datasets.",
    ),
    (
        ("clean", "missing", "duplicate", "impute", "deduplicate"),
        "**Cleaning your data — Data Cleaning tab:**\n\n"
        "Open your dataset → **Data Cleaning** tab (2nd tab).\n\n"
        "You can fill missing values, drop/rename columns, deduplicate rows, "
        "cap outliers and encode categories. Every operation is listed in the "
        "Steps panel with **Undo/Redo**. Save a named **Version**, then **Commit** "
        "to save the cleaned dataset.\n\n"
        "_Want the best method for your specific columns? The Data Scientist AI "
        "(Chat tab) can recommend one from your data._",
    ),
    (
        ("model studio", "train", "automl", "predict best", "build model", "classification", "regression"),
        "**Training a model — Model Studio tab:**\n\n"
        "Open your dataset → **Model Studio** tab.\n\n"
        "It's a guided flow: **Analyze → Objective → Train → Report**.\n"
        "1. Analyze detects targets and data readiness\n"
        "2. Pick a business **Objective** (or a target column in Advanced mode)\n"
        "3. **Beginner** mode trains automatically; **Advanced** exposes algorithms, "
        "test split, CV folds and tuning\n"
        "4. Review the leaderboard, best-model report and try the **Playground**.\n\n"
        "Training runs in the background with a toast when done.",
    ),
    (
        ("notebook", "python cell", "run code", "scratchpad", "jupyter"),
        "**Notebook tab:**\n\n"
        "Open your dataset → **Notebook** tab.\n\n"
        "Your dataset is pre-loaded as `df`. Available: `pandas`, `numpy`, "
        "`matplotlib`, `seaborn`, `plotly`, `sklearn`.\n\n"
        "- Add **Code** or **Text** cells\n"
        "- Run a cell with ▶ or **Run All**\n"
        "- **AI Assist** turns a description into code\n"
        "- The **Variable Explorer** (right) lists your variables",
    ),
    (
        ("explore", "chart", "visual", "plot", "graph", "eda"),
        "**Explore tab:**\n\n"
        "Open your dataset → **Explore** tab.\n\n"
        "Build charts interactively (pick a type, map columns, tune the palette) "
        "and browse AI-generated EDA — histograms, box plots, scatter and a "
        "correlation heatmap, each with an explanation.",
    ),
    (
        ("feature engineering", "derive feature", "new feature", "derived column"),
        "**Feature Engineering:**\n\n"
        "Open **Feature Engineering** in the sidebar (ANALYSIS group) to build and "
        "manage derived features across a dataset. You can also craft features "
        "inline in the **Notebook** tab.\n\n"
        "_For ideas tailored to your columns, ask the Data Scientist AI in the "
        "Chat tab._",
    ),
    (
        ("insight", "finding", "recommendation", "takeaway"),
        "**AI Insights tab:**\n\n"
        "Open your dataset → **AI Insights** tab (or **AI Insights** in the sidebar).\n\n"
        "Each finding shows **what we found**, **why it happens**, a "
        "**recommendation**, the **business impact** and a **confidence level**, "
        "with an executive summary and ordered next steps at the top.",
    ),
    (
        ("report", "export", "download", "pdf", "csv export"),
        "**Reports & exports:**\n\n"
        "Open your dataset → **Reports** tab (or **Reports** in the sidebar).\n\n"
        "Choose **Executive**, **Business** or **Technical** — each is tailored to "
        "its audience — then view or export it.",
    ),
    (
        ("sql", "query", "duckdb"),
        "**SQL Editor:**\n\n"
        "Open **SQL Editor** in the sidebar (TOOLS group).\n\n"
        "Write SQL over your datasets using DuckDB — each dataset is a table you "
        "can `SELECT` from directly.\n\n"
        "_Need a query written for your data? The Data Scientist AI can generate "
        "it from your columns._",
    ),
    (
        ("experiment", "compare runs", "track run"),
        "**Experiments:**\n\n"
        "Open **Experiments** in the sidebar (ANALYSIS group) to track and compare "
        "your training runs side by side.",
    ),
    (
        ("model registry", "registered model", "deploy model"),
        "**Model Registry:**\n\n"
        "Reach it from the **Command Palette** (Ctrl+K → “Model Registry”). It "
        "lists your trained models for reuse.",
    ),
    (
        ("role", "permission", "view as", "executive view", "business user"),
        "**Role View (Settings):**\n\n"
        "Go to **Settings** → **Role View**, or use the **Role Switcher** in the "
        "topbar.\n\n"
        "- **Owner / Data Scientist / Analyst** → full technical detail\n"
        "- **Executive / Business User** → plain-English summaries; raw numbers hidden\n\n"
        "This changes UI depth only, not permissions.",
    ),
    (
        ("profile", "quality score", "completeness", "data quality"),
        "**Data Profile tab:**\n\n"
        "Open your dataset → **Data Profile** tab (the first tab).\n\n"
        "It shows row/column counts, missing cells, duplicate rows, a quality "
        "score (0-100, grade A-F), per-column types and cardinality, suggested "
        "target columns and a sample preview.",
    ),
    (
        ("team", "invite", "member", "colleague"),
        "**Team:**\n\n"
        "Open **Team** in the sidebar (ADMINISTRATION group) → invite members by "
        "email and assign roles (Owner, Data Scientist, Analyst, Executive, "
        "Business User).",
    ),
    (
        ("api key", "api-key", "programmatic", "access token"),
        "**API Keys:**\n\n"
        "Open **API Keys** in the sidebar (ADMINISTRATION group) → generate a key "
        "for programmatic access to the API.",
    ),
    (
        ("setting", "theme", "dark mode", "light mode", "appearance"),
        "**Settings:**\n\n"
        "Open **Settings** in the sidebar.\n\n"
        "- **Profile** — your name, email, workspace\n"
        "- **Role View** — preview the UI as different roles\n"
        "- **Appearance** — Light, Dark or System theme",
    ),
    (
        ("dashboard",),
        "**Dashboard:**\n\n"
        "Reach it from the **Command Palette** (Ctrl+K → “Dashboard”) for an "
        "overview of recent projects and activity. There's also a "
        "**Dashboard Builder** for custom layouts.",
    ),
    (
        ("search", "command palette", "shortcut", "find a page"),
        "**Command Palette:**\n\n"
        "Press **Ctrl+K** (or **Cmd+K**), or click **Search…** in the topbar, to "
        "jump to any page, project or dataset.",
    ),
    (
        ("chat tab", "data scientist ai", "ask about my data", "ai assistant"),
        "**Data Scientist AI (Chat tab):**\n\n"
        "Open your dataset → **Chat** tab (last tab). It's the technical assistant "
        "with secure, isolated access to *this* dataset — ask it to analyse "
        "columns, run stats, recommend models or generate code.",
    ),
    (
        ("workflow", "get started", "where do i start", "first step", "how to use", "steps to"),
        "**Recommended workflow:**\n\n"
        "1. **Projects** → create a project\n"
        "2. **Upload dataset** (CSV, Excel or JSON)\n"
        "3. **Data Profile** → review the quality score\n"
        "4. **AI Insights** → read the AI findings\n"
        "5. **Data Cleaning** → fix missing values, duplicates, outliers\n"
        "6. **Explore** → charts and correlations\n"
        "7. **Model Studio** → train and compare models\n"
        "8. **Chat** → ask the Data Scientist AI about your data\n"
        "9. **Reports** → generate and export a report",
    ),
]


def answer_app_help(question: str) -> str | None:
    """Return step-by-step product help, or ``None`` if not an app question.

    Deterministic and offline. Shared by the Copilot (its main brain) and the
    Data Scientist AI (so it can answer navigation questions too).
    """
    q = (question or "").lower()
    for keywords, answer in _HELP_ROUTES:
        if any(k in q for k in keywords):
            return answer
    # A bare "where is X" / "how do I ..." with no matched feature still reads
    # as navigation — offer the map rather than nothing.
    if re.search(r"\bwhere is\b|\bwhere's\b|\bhow do i\b|\bhow can i\b|\bnavigate\b", q):
        return (
            "Here's how the app is laid out:\n\n"
            "- **Sidebar** — Projects, Datasets, AI Insights, Reports, "
            "Feature Engineering, Experiments, SQL Editor, Team, API Keys, Settings\n"
            "- **A dataset** has 8 tabs — Data Profile, Data Cleaning, Explore, "
            "Model Studio, AI Insights, Notebook, Reports and Chat\n"
            "- **Ctrl+K** opens the command palette to jump anywhere.\n\n"
            "Tell me the feature you're after and I'll point you to the exact spot."
        )
    return None


def copilot_greeting() -> str:
    """Friendly generic fallback for the Copilot."""
    return (
        "I'm the **DataMind AI Copilot** — your product guide. 👋\n\n"
        "I can help you:\n"
        "- Navigate the app (pages, tabs, buttons)\n"
        "- Understand any feature or workflow\n"
        "- Follow step-by-step guides (upload data, train a model, clean data…)\n\n"
        "For questions about **your actual data** (columns, statistics, model "
        "results), use the **Chat** tab inside your dataset — that's the "
        "**Data Scientist AI**. 🔬\n\n"
        "What would you like to do?"
    )
