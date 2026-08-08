"""AI Copilot — product assistant endpoint.

This assistant knows the application UI, pages, workflows and features.
It has ZERO access to datasets, notebooks, models or any user data.
It is completely isolated from the Data Scientist AI.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentAuth, get_current_auth
from app.services.ai.copilot_mock import CopilotMockProvider
from app.services.ai.base import ChatTurn, LLMProvider
from app.services.ai import product_kb
from app.core.config import settings

router = APIRouter(tags=["copilot"])

# ---------------------------------------------------------------------------
# Copilot provider — never touches dataset data
# ---------------------------------------------------------------------------

def _get_copilot_llm() -> LLMProvider:
    """Return the copilot LLM. Uses the same real provider if configured,
    but with a product-only system prompt. Falls back to CopilotMockProvider."""
    provider = settings.ai_provider.lower().strip()
    if provider not in ("", "mock"):
        # Reuse the real LLM but wrap it with the copilot system prompt
        try:
            from app.services.ai.factory import get_llm
            return get_llm()
        except Exception:  # noqa: BLE001
            pass
    return CopilotMockProvider()


# The Copilot's knowledge and handoff rules come from the shared product KB
# (services/ai/product_kb.py) so both assistants stay perfectly in sync.


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

class CopilotRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[dict[str, str]] = Field(default_factory=list)


class CopilotResponse(BaseModel):
    reply: str
    handoff: bool = False  # True when the copilot is transferring to Data Scientist AI


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/copilot/chat", response_model=CopilotResponse)
def copilot_chat(
    payload: CopilotRequest,
    auth: CurrentAuth = Depends(get_current_auth),
) -> CopilotResponse:
    """Product-only assistant. No dataset access whatsoever."""
    handoff = product_kb.is_data_question(payload.message)

    llm = _get_copilot_llm()

    # Build messages — system prompt enforces product-only scope
    messages: list[ChatTurn] = [
        ChatTurn(role="system", content=product_kb.copilot_system_prompt())
    ]
    for turn in payload.history[-6:]:
        role = turn.get("role", "user")
        if role in ("user", "assistant"):
            messages.append(ChatTurn(role=role, content=turn.get("content", "")))
    messages.append(ChatTurn(role="user", content=payload.message))

    try:
        reply = llm.complete(messages, temperature=0.3)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Copilot error: {exc}",
        )

    return CopilotResponse(reply=reply, handoff=handoff)
