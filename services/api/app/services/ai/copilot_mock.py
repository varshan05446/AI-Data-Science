"""Deterministic offline mock for the AI Copilot.

Knows everything about the application UI, pages, workflows and features — all of
which lives in the shared product knowledge base (:mod:`product_kb`) so it can
never drift from the Data Scientist AI's view of the app.

Has ZERO access to datasets, notebooks, models or any user data. When it detects
a data question it hands off to the Data Scientist AI instead of guessing.
"""
from __future__ import annotations

from app.services.ai import product_kb
from app.services.ai.base import ChatTurn, LLMProvider

_HANDOFF_REPLY = (
    "That question requires analysing your actual dataset — which is outside my "
    "scope as the Product Guide.\n\n"
    "I'll hand you off to the **Data Scientist AI** (the **Chat** tab inside your "
    "dataset). It has secure, isolated access to your data and can answer this "
    "directly. 🔬"
)


class CopilotMockProvider(LLMProvider):
    """Offline product guide. Answers 'how do I…' / 'where is…' questions only."""

    name = "copilot_mock"

    def complete(self, messages: list[ChatTurn], *, temperature: float = 0.2) -> str:
        user_msg = next((m.content for m in reversed(messages) if m.role == "user"), "")

        # Data questions are never answered here — hand off, never guess.
        if product_kb.is_data_question(user_msg):
            return _HANDOFF_REPLY

        # Deterministic product help, falling back to a friendly greeting.
        return product_kb.answer_app_help(user_msg) or product_kb.copilot_greeting()
