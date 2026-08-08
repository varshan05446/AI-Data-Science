"""Concrete LLM providers.

All network providers are implemented over ``httpx`` (already a dependency) so
no vendor SDKs are required. Two shapes cover every supported backend:

* :class:`OpenAICompatProvider` - the OpenAI ``/chat/completions`` contract,
  shared by OpenAI, Azure OpenAI, Google Gemini (compat endpoint), Ollama and
  OpenRouter. They differ only in base URL, auth header and model name.
* :class:`AnthropicProvider` - Anthropic's ``/messages`` contract.

The provider is chosen by :func:`app.services.ai.factory.get_llm` from settings;
application code only ever depends on the :class:`LLMProvider` interface, so a
new backend can be added here without touching routers or agents.
"""
from __future__ import annotations

import httpx

from app.services.ai.base import ChatTurn, LLMProvider

_TIMEOUT = httpx.Timeout(60.0, connect=10.0)


class OpenAICompatProvider(LLMProvider):
    """Any backend speaking the OpenAI chat-completions protocol."""

    def __init__(
        self,
        *,
        name: str,
        base_url: str,
        model: str,
        api_key: str = "",
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        self.name = name
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._api_key = api_key
        self._extra_headers = extra_headers or {}

    def complete(self, messages: list[ChatTurn], *, temperature: float = 0.2) -> str:
        headers = {"Content-Type": "application/json", **self._extra_headers}
        if self._api_key:
            headers.setdefault("Authorization", f"Bearer {self._api_key}")
        body = {
            "model": self._model,
            "messages": [m.as_dict() for m in messages],
            "temperature": temperature,
        }
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(
                f"{self._base_url}/chat/completions", json=body, headers=headers
            )
            resp.raise_for_status()
            data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


class AzureOpenAIProvider(OpenAICompatProvider):
    """Azure routes by deployment and uses an ``api-key`` header + api-version."""

    def __init__(
        self,
        *,
        endpoint: str,
        deployment: str,
        api_key: str,
        api_version: str,
    ) -> None:
        base = f"{endpoint.rstrip('/')}/openai/deployments/{deployment}"
        super().__init__(
            name="azure",
            base_url=base,
            model=deployment,
            extra_headers={"api-key": api_key},
        )
        self._api_version = api_version

    def complete(self, messages: list[ChatTurn], *, temperature: float = 0.2) -> str:
        headers = {"Content-Type": "application/json", **self._extra_headers}
        body = {
            "messages": [m.as_dict() for m in messages],
            "temperature": temperature,
        }
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(
                f"{self._base_url}/chat/completions",
                params={"api-version": self._api_version},
                json=body,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


class AnthropicProvider(LLMProvider):
    """Anthropic Claude via the native ``/messages`` API."""

    name = "anthropic"

    def __init__(self, *, base_url: str, model: str, api_key: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._api_key = api_key

    def complete(self, messages: list[ChatTurn], *, temperature: float = 0.2) -> str:
        system = "\n\n".join(m.content for m in messages if m.role == "system")
        turns = [
            {"role": m.role, "content": m.content}
            for m in messages
            if m.role in ("user", "assistant")
        ]
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self._api_key,
            "anthropic-version": "2023-06-01",
        }
        body: dict = {
            "model": self._model,
            "max_tokens": 1024,
            "temperature": temperature,
            "messages": turns,
        }
        if system:
            body["system"] = system
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(f"{self._base_url}/messages", json=body, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        parts = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
        return "".join(parts).strip()
