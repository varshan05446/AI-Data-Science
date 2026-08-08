"""Conversational chat with a dataset.

A chat session belongs to a dataset. Each user message is grounded in the
dataset's stored profile and answered by the configured LLM provider (mock by
default). Messages are persisted for history.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentAuth, get_current_auth
from app.api.resources import get_owned_dataset
from app.core.database import get_db
from app.models import (
    ChatMessage,
    ChatSession,
    CleaningSession,
    Dataset,
    ModelRun,
    ProfileReport,
)
from app.schemas import ChatMessageOut, ChatRequest, ChatResponse
from app.services.ai import get_llm
from app.services.ai.agents import expert_answer
from app.services.dataset_io import read_dataset_dataframe

router = APIRouter(tags=["chat"])


def _build_dataset_context(db: Session, dataset: Dataset) -> str:
    """Assemble extra context for the Data Scientist AI, scoped to THIS dataset.

    Includes recent model runs and the cleaning history so the assistant is
    project/model/cleaning-aware. Every query is filtered by ``dataset.id`` so
    nothing from another dataset or project can ever be included.
    """
    parts: list[str] = []

    runs = db.scalars(
        select(ModelRun)
        .where(ModelRun.dataset_id == dataset.id)
        .order_by(ModelRun.created_at.desc())
        .limit(3)
    ).all()
    if runs:
        lines = [
            f"- {r.best_model_label or r.best_model_key or 'model'} "
            f"predicting '{r.target}' ({r.task}): "
            f"{r.primary_metric or 'score'}={round(r.primary_score, 4)}"
            for r in runs
        ]
        parts.append("Recent model runs on this dataset:\n" + "\n".join(lines))

    cleaning = db.scalar(
        select(CleaningSession).where(CleaningSession.dataset_id == dataset.id)
    )
    if cleaning and cleaning.steps:
        ops = [str(s.get("op", s)) if isinstance(s, dict) else str(s) for s in cleaning.steps]
        parts.append(
            f"Cleaning history ({len(ops)} step(s) applied): " + ", ".join(ops[:8])
        )

    return "\n".join(parts)


@router.get("/datasets/{dataset_id}/chat/messages", response_model=list[ChatMessageOut])
def list_messages(
    dataset: Dataset = Depends(get_owned_dataset),
    auth: CurrentAuth = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[ChatMessageOut]:
    session = db.scalar(
        select(ChatSession)
        .where(ChatSession.dataset_id == dataset.id, ChatSession.user_id == auth.user_id)
        .order_by(ChatSession.created_at.desc())
    )
    if session is None:
        return []
    return [ChatMessageOut.model_validate(m) for m in session.messages]


@router.post("/datasets/{dataset_id}/chat", response_model=ChatResponse)
def send_message(
    payload: ChatRequest,
    dataset: Dataset = Depends(get_owned_dataset),
    auth: CurrentAuth = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ChatResponse:
    # Find or create a session for this user + dataset.
    session: ChatSession | None = None
    if payload.session_id:
        session = db.scalar(
            select(ChatSession).where(
                ChatSession.id == payload.session_id,
                ChatSession.dataset_id == dataset.id,
                ChatSession.user_id == auth.user_id,
            )
        )
    if session is None:
        session = db.scalar(
            select(ChatSession).where(
                ChatSession.dataset_id == dataset.id, ChatSession.user_id == auth.user_id
            )
        )
    if session is None:
        session = ChatSession(
            workspace_id=auth.workspace_id,
            dataset_id=dataset.id,
            user_id=auth.user_id,
            title=payload.message[:60],
        )
        db.add(session)
        db.flush()

    history = [{"role": m.role, "content": m.content} for m in session.messages]

    # Persist the user's message.
    db.add(ChatMessage(session_id=session.id, role="user", content=payload.message))

    profile_row = db.scalar(
        select(ProfileReport).where(ProfileReport.dataset_id == dataset.id)
    )
    profile = profile_row.report if profile_row else {}

    # Load the real DataFrame so the assistant can compute genuine answers.
    # Never fail the chat if the file can't be read; fall back to profile-only.
    df = None
    try:
        df = read_dataset_dataframe(dataset)
    except Exception:  # noqa: BLE001 - degrade gracefully to profile-grounded answers
        df = None

    # Isolated project/model/cleaning context for THIS dataset only.
    extra_context = _build_dataset_context(db, dataset)

    try:
        answer, ai_payload = expert_answer(
            get_llm(), profile, df, history, payload.message,
            dataset_id=dataset.id, extra_context=extra_context,
        )
    except Exception as exc:  # noqa: BLE001 - surface AI errors cleanly
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI provider error: {exc}",
        )

    assistant = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=answer,
        payload=ai_payload,
    )
    db.add(assistant)
    db.commit()
    db.refresh(assistant)
    return ChatResponse(
        session_id=session.id, message=ChatMessageOut.model_validate(assistant)
    )
