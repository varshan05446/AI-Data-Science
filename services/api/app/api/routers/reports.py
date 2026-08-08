"""Report generation.

Two generations of reports live side by side:

- Legacy Markdown builders (executive / business / technical) kept for API
  compatibility. The ``executive`` type now renders through the professional
  document builder for a much richer result (same response shape).
- The professional reporting center: structured report documents
  (executive / data_analysis / model / ai_insight) rendered to Markdown, HTML,
  PDF, Word and PowerPoint via ``app.services.reports``.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.resources import get_owned_dataset
from app.core.database import get_db
from app.models import Dataset, ProfileReport
from app.services.ai.agents import generate_insights
from app.services.reports import (
    REPORT_TITLES,
    ExportUnavailable,
    available_formats,
    build_report,
    collect_context,
    render_docx,
    render_html,
    render_markdown,
    render_pdf,
    render_pptx,
)

router = APIRouter(tags=["reports"])

_REPORT_TYPES = {"executive", "business", "technical"} | set(REPORT_TITLES)

_REPORT_DESCRIPTIONS = {
    "executive": "Board-ready summary: KPIs, findings, recommendations, risks and next steps.",
    "data_analysis": "Deep dive into data quality: missing values, outliers, statistics and correlations.",
    "model": "Full ML documentation: algorithms, tuning, cross-validation, metrics and diagnostics.",
    "ai_insight": "AI-generated patterns, anomalies, opportunities, risks and trend analysis.",
}

_EXPORT_FORMATS = {
    "markdown": ("text/markdown; charset=utf-8", "md"),
    "html": ("text/html; charset=utf-8", "html"),
    "pdf": ("application/pdf", "pdf"),
    "docx": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "docx",
    ),
    "pptx": (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "pptx",
    ),
}


class ReportOut(BaseModel):
    dataset_id: str
    report_type: str
    format: str = "markdown"
    content: str


def _load_profile(db: Session, dataset: Dataset) -> dict:
    row = db.scalar(select(ProfileReport).where(ProfileReport.dataset_id == dataset.id))
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Profile not available yet"
        )
    return row.report


def _executive(dataset: Dataset, profile: dict, insights: list[dict]) -> str:
    s = profile.get("dataset_summary", {})
    q = profile.get("quality", {})
    lines = [
        f"# Executive Summary - {dataset.name}",
        "",
        f"**Dataset:** {s.get('rows', 0):,} rows x {s.get('columns', 0)} columns  ",
        f"**Data quality:** {q.get('grade', 'n/a')} ({q.get('score', 0)}/100)",
        "",
        "## Key Findings",
    ]
    for i in insights[:4]:
        lines.append(
            f"- **{i['title']}** - {i['what_we_found']} "
            f"_(confidence {int(i['confidence'] * 100)}%)_"
        )
    lines += ["", "## Recommended Actions"]
    for i in insights[:4]:
        lines.append(f"- {i['recommendation']}")
    return "\n".join(lines)


def _business(dataset: Dataset, profile: dict, insights: list[dict]) -> str:
    lines = [f"# Business Report - {dataset.name}", "", "## Insights and Impact", ""]
    for i in insights:
        lines += [
            f"### {i['title']}",
            f"- **What we found:** {i['what_we_found']}",
            f"- **Why it happens:** {i['why_it_happens']}",
            f"- **Recommendation:** {i['recommendation']}",
            f"- **Business impact:** {i['business_impact']}",
            f"- **Confidence:** {int(i['confidence'] * 100)}%",
            "",
        ]
    return "\n".join(lines)


def _technical(dataset: Dataset, profile: dict, insights: list[dict]) -> str:
    s = profile.get("dataset_summary", {})
    lines = [
        f"# Technical Report - {dataset.name}",
        "",
        "## Dataset Summary",
        f"- Rows: {s.get('rows', 0)}",
        f"- Columns: {s.get('columns', 0)}",
        f"- Duplicate rows: {s.get('duplicate_rows', 0)} ({s.get('duplicate_pct', 0)}%)",
        f"- Missing cells: {s.get('total_missing_cells', 0)}",
        "",
        "## Column Types",
    ]
    for k, v in profile.get("dtypes", {}).items():
        lines.append(f"- {k}: {v}")
    pairs = profile.get("correlation", {}).get("top_pairs", [])
    if pairs:
        lines += ["", "## Strongest Correlations"]
        for p in pairs[:5]:
            lines.append(f"- {p['a']} <-> {p['b']}: {p['corr']}")
    targets = profile.get("target_suggestions", [])
    if targets:
        lines += ["", "## Suggested Modelling Targets"]
        for t in targets:
            lines.append(
                f"- {t['column']} ({t['type']}, confidence {int(t['confidence'] * 100)}%)"
            )
    return "\n".join(lines)


@router.get("/datasets/{dataset_id}/reports", response_model=None)
def list_report_center(
    dataset: Dataset = Depends(get_owned_dataset),
) -> dict:
    """Reporting-center metadata: professional report types + export formats."""
    return {
        "dataset_id": dataset.id,
        "types": [
            {
                "type": key,
                "title": REPORT_TITLES[key],
                "description": _REPORT_DESCRIPTIONS.get(key, ""),
            }
            for key in ("executive", "data_analysis", "model", "ai_insight")
        ],
        "formats": available_formats(),
    }


def _build_document(db: Session, dataset: Dataset, report_type: str) -> dict:
    if report_type not in REPORT_TITLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown report type. Choose one of: {', '.join(sorted(REPORT_TITLES))}",
        )
    profile = _load_profile(db, dataset)
    insights = generate_insights(profile)
    ctx = collect_context(db, dataset, profile, insights)
    return build_report(report_type, ctx)


@router.get("/datasets/{dataset_id}/reports/{report_type}/document", response_model=None)
def report_document(
    report_type: str,
    dataset: Dataset = Depends(get_owned_dataset),
    db: Session = Depends(get_db),
) -> dict:
    """Structured report document (sections of typed blocks) for the UI."""
    return _build_document(db, dataset, report_type)


@router.get("/datasets/{dataset_id}/reports/{report_type}/export")
def export_report(
    report_type: str,
    format: str = Query("pdf"),
    dataset: Dataset = Depends(get_owned_dataset),
    db: Session = Depends(get_db),
) -> Response:
    """Download a report as PDF / Word / PowerPoint / Markdown / HTML."""
    fmt = format.lower()
    if fmt not in _EXPORT_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown format. Choose one of: {', '.join(sorted(_EXPORT_FORMATS))}",
        )
    doc = _build_document(db, dataset, report_type)

    try:
        if fmt == "markdown":
            payload: bytes = render_markdown(doc).encode("utf-8")
        elif fmt == "html":
            payload = render_html(doc).encode("utf-8")
        elif fmt == "pdf":
            payload = render_pdf(doc)
        elif fmt == "docx":
            payload = render_docx(doc)
        else:
            payload = render_pptx(doc)
    except ExportUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    media_type, ext = _EXPORT_FORMATS[fmt]
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", dataset.name).strip("-") or "dataset"
    filename = f"{stem}-{report_type.replace('_', '-')}-report.{ext}"
    return Response(
        content=payload,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/datasets/{dataset_id}/reports/{report_type}", response_model=ReportOut)
def generate_report(
    report_type: str,
    dataset: Dataset = Depends(get_owned_dataset),
    db: Session = Depends(get_db),
) -> ReportOut:
    if report_type not in _REPORT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown report type. Choose one of: {', '.join(sorted(_REPORT_TYPES))}",
        )
    # Professional document types (incl. the upgraded executive report) render
    # via the shared builder; the legacy business/technical builders remain.
    if report_type in REPORT_TITLES:
        doc = _build_document(db, dataset, report_type)
        return ReportOut(
            dataset_id=dataset.id, report_type=report_type, content=render_markdown(doc)
        )
    profile = _load_profile(db, dataset)
    insights = generate_insights(profile)
    builder = {"business": _business, "technical": _technical}[report_type]
    return ReportOut(
        dataset_id=dataset.id, report_type=report_type, content=builder(dataset, profile, insights)
    )
