"""AI layer interfaces and shared data shapes."""
from __future__ import annotations

import abc
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

Role = Literal["system", "user", "assistant"]


@dataclass
class ChatTurn:
    role: Role
    content: str

    def as_dict(self) -> dict[str, str]:
        return {"role": self.role, "content": self.content}


@dataclass
class Insight:
    """The structured, explainable insight shape used across the product.

    Mirrors the core philosophy: why / found / recommend / confidence / impact.
    """

    title: str
    what_we_found: str
    why_it_happens: str
    recommendation: str
    business_impact: str
    confidence: float  # 0.0 - 1.0
    severity: Literal["info", "low", "medium", "high"] = "info"
    tags: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class LLMProvider(abc.ABC):
    """Minimal chat-completion interface implemented by all providers."""

    name: str = "base"

    @abc.abstractmethod
    def complete(self, messages: list[ChatTurn], *, temperature: float = 0.2) -> str:
        """Return a single text completion for the given conversation."""
