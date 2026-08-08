"""OpenAI-backed LLM provider (optional).

The openai SDK is imported lazily so the dependency is only required when
AI_PROVIDER=openai. Customer data passed here is used only for inference and is
never used to train models (see README security posture).
"""
from __future__ import annotations

from app.core.config import settings
from app.services.ai.base import ChatTurn, LLMProvider


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(self, api_key: str, model: str) -> None:
        from openai import OpenAI  # lazy import

        self._client = OpenAI(api_key=api_key)
        self._model = model

    def complete(self, messages: list[ChatTurn], *, temperature: float = 0.2) -> str:
        resp = self._client.chat.completions.create(
            model=self._model,
            messages=[m.as_dict() for m in messages],
            temperature=temperature,
        )
        return (resp.choices[0].message.content or "").strip()


def build_openai_provider() -> OpenAIProvider:
    if not settings.openai_api_key:
        raise RuntimeError(
            "AI_PROVIDER=openai but OPENAI_API_KEY is not set. "
            "Set the key or use AI_PROVIDER=mock."
        )
    return OpenAIProvider(settings.openai_api_key, settings.openai_model)
