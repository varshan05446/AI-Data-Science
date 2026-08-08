"""Professional reporting service.

- ``builder``    : profile/insights/model-runs -> structured report document
- ``renderers``  : document -> Markdown / standalone HTML
- ``exporters``  : document -> PDF / Word / PowerPoint bytes (optional deps)
"""
from app.services.reports.builder import (
    REPORT_TITLES,
    build_report,
    collect_context,
)
from app.services.reports.exporters import (
    ExportUnavailable,
    available_formats,
    render_docx,
    render_pdf,
    render_pptx,
)
from app.services.reports.renderers import render_html, render_markdown

__all__ = [
    "REPORT_TITLES",
    "build_report",
    "collect_context",
    "ExportUnavailable",
    "available_formats",
    "render_docx",
    "render_pdf",
    "render_pptx",
    "render_html",
    "render_markdown",
]
