"""Swappable AI layer.

Everything depends on the `LLMProvider` interface. The default `MockProvider`
is deterministic and fully offline; `OpenAIProvider` is used when
AI_PROVIDER=openai and OPENAI_API_KEY is set.
"""
from app.services.ai.base import ChatTurn, Insight, LLMProvider
from app.services.ai.factory import get_llm

__all__ = ["ChatTurn", "Insight", "LLMProvider", "get_llm"]
