"""AI provider factory: selects the provider from configuration.

Any misconfiguration (missing key, unknown provider) degrades gracefully to the
deterministic offline :class:`MockProvider` so the product always runs.
"""
from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.services.ai.base import LLMProvider


def _build(provider: str) -> LLMProvider | None:
    from app.services.ai.providers import (
        AnthropicProvider,
        AzureOpenAIProvider,
        OpenAICompatProvider,
    )

    if provider == "openai" and settings.openai_api_key:
        return OpenAICompatProvider(
            name="openai",
            base_url=settings.openai_base_url,
            model=settings.openai_model,
            api_key=settings.openai_api_key,
        )
    if provider == "azure" and settings.azure_openai_api_key and settings.azure_openai_endpoint:
        return AzureOpenAIProvider(
            endpoint=settings.azure_openai_endpoint,
            deployment=settings.azure_openai_deployment,
            api_key=settings.azure_openai_api_key,
            api_version=settings.azure_openai_api_version,
        )
    if provider == "gemini" and settings.gemini_api_key:
        return OpenAICompatProvider(
            name="gemini",
            base_url=settings.gemini_base_url,
            model=settings.gemini_model,
            api_key=settings.gemini_api_key,
        )
    if provider == "anthropic" and settings.anthropic_api_key:
        return AnthropicProvider(
            base_url=settings.anthropic_base_url,
            model=settings.anthropic_model,
            api_key=settings.anthropic_api_key,
        )
    if provider == "openrouter" and settings.openrouter_api_key:
        return OpenAICompatProvider(
            name="openrouter",
            base_url=settings.openrouter_base_url,
            model=settings.openrouter_model,
            api_key=settings.openrouter_api_key,
        )
    if provider == "ollama":  # local, no key required
        return OpenAICompatProvider(
            name="ollama",
            base_url=settings.ollama_base_url,
            model=settings.ollama_model,
            api_key="ollama",
        )
    return None


@lru_cache
def get_llm() -> LLMProvider:
    from app.services.ai.mock import MockProvider

    provider = settings.ai_provider.lower().strip()
    if provider in ("", "mock"):
        return MockProvider()
    try:
        built = _build(provider)
    except Exception:  # noqa: BLE001 - never fail startup on AI misconfig
        built = None
    return built or MockProvider()
