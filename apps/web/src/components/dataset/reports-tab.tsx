"use client";

/**
 * Professional reporting center for a dataset.
 *
 * Four consulting-grade report types (Executive / Data Analysis / Model /
 * AI Insight) are built server-side as structured documents and rendered
 * natively here: branded cover, table of contents, numbered sections, tables
 * and callouts. Each report exports to PDF, Word, PowerPoint, Markdown and
 * HTML. A companion panel still downloads the raw data and analysis (CSV,
 * Excel, JSON, Notebook, SQL) via the existing export endpoint.
 */
import {
  BrainCircuit,
  Download,
  FileBarChart,
  FileCode,
  FileText,
  FileType,
  Loader2,
  Presentation,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import * as React from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { LoadingLines } from "@/components/shared/loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import {
  useExportFile,
  useExportFormats,
  useReportCenter,
  useReportDocument,
  useReportExport,
} from "@/lib/hooks";
import type {
  ProReportType,
  ReportBlock,
  ReportDocument,
  ReportSection,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const REPORT_META: Record<
  ProReportType,
  { label: string; icon: typeof FileText; blurb: string }
> = {
  executive: {
    label: "Executive Report",
    icon: Presentation,
    blurb: "Board-ready summary: KPIs, findings, recommendations and risks.",
  },
  data_analysis: {
    label: "Data Analysis Report",
    icon: FileBarChart,
    blurb: "Data quality deep dive: missing values, outliers, statistics.",
  },
  model: {
    label: "Model Report",
    icon: BrainCircuit,
    blurb: "Full ML documentation: algorithms, tuning, CV and diagnostics.",
  },
  ai_insight: {
    label: "AI Insight Report",
    icon: Sparkles,
    blurb: "AI-detected patterns, anomalies, opportunities and trends.",
  },
};

const REPORT_ORDER: ProReportType[] = [
  "executive",
  "data_analysis",
  "model",
  "ai_insight",
];

const EXPORT_BUTTONS: { format: string; label: string; icon: typeof FileText }[] = [
  { format: "pdf", label: "PDF", icon: FileType },
  { format: "docx", label: "Word", icon: FileText },
  { format: "pptx", label: "PowerPoint", icon: Presentation },
  { format: "markdown", label: "Markdown", icon: FileCode },
  { format: "html", label: "HTML", icon: FileCode },
];

const EXPORT_EXT: Record<string, string> = {
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  markdown: "md",
  html: "html",
};

const DATA_EXPORT_META: Record<string, { label: string; ext: string; hint: string }> = {
  csv: { label: "CSV data", ext: "csv", hint: "Original rows" },
  excel: { label: "Excel workbook", ext: "xlsx", hint: "Data + summary sheets" },
  json: { label: "JSON profile", ext: "json", hint: "Full profile report" },
  notebook: { label: "Jupyter notebook", ext: "ipynb", hint: "Starter analysis" },
  sql: { label: "SQL schema", ext: "sql", hint: "CREATE TABLE" },
  pdf: { label: "PDF", ext: "pdf", hint: "Use the report exports above" },
  powerpoint: { label: "PowerPoint", ext: "pptx", hint: "Use the report exports above" },
};

// --- Native document renderer ------------------------------------------------
function BlockView({ block }: { block: ReportBlock }) {
  if (block.type === "p") {
    if (!block.text) return null;
    return <p className="text-sm leading-relaxed text-foreground/90">{block.text}</p>;
  }
  if (block.type === "callout") {
    if (!block.text) return null;
    return (
      <div className="rounded-r-lg border-l-4 border-primary bg-primary/5 px-4 py-3 text-sm italic text-foreground/90">
        {block.text}
      </div>
    );
  }
  if (block.type === "kv") {
    const items = (block.items ?? []) as [string, string][];
    if (!items.length) return null;
    return (
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <tbody>
            {items.map(([k, v], i) => (
              <tr key={i} className={cn(i > 0 && "border-t")}>
                <td className="w-1/3 bg-muted/50 px-3 py-1.5 font-medium">{k}</td>
                <td className="px-3 py-1.5">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === "list") {
    const items = (block.items ?? []) as string[];
    if (!items.length) return null;
    const Tag = block.ordered ? "ol" : "ul";
    return (
      <Tag
        className={cn(
          "space-y-1 pl-5 text-sm text-foreground/90",
          block.ordered ? "list-decimal" : "list-disc",
        )}
      >
        {items.map((item, i) => (
          <li key={i}>{String(item)}</li>
        ))}
      </Tag>
    );
  }
  if (block.type === "table") {
    const cols = block.columns ?? [];
    const rows = block.rows ?? [];
    if (!rows.length) return null;
    return (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/60">
              {cols.map((c, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 30).map((row, i) => (
              <tr key={i} className="border-t even:bg-muted/20">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-1.5">
                    {String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}

function SectionView({ section, index }: { section: ReportSection; index: number }) {
  return (
    <section id={`report-sec-${index}`} className="space-y-3">
      <h3 className="flex items-baseline gap-2 border-b pb-2 text-base font-semibold tracking-tight">
        <span className="font-mono text-sm text-primary">
          {String(index).padStart(2, "0")}
        </span>
        {section.heading}
      </h3>
      {section.blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </section>
  );
}

function DocumentView({ doc }: { doc: ReportDocument }) {
  const generated = React.useMemo(() => {
    try {
      return new Date(doc.generated_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return doc.generated_at;
    }
  }, [doc.generated_at]);

  return (
    <div className="space-y-8">
      {/* Cover */}
      <div className="border-b-4 border-primary pb-6">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
          {doc.brand}
        </div>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">{doc.title}</h2>
        <p className="mt-1 text-muted-foreground">{doc.subtitle}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Generated {generated} · Confidential — internal use
        </p>
      </div>

      {/* Table of contents */}
      <div className="rounded-xl border bg-muted/30 px-5 py-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Table of Contents
        </div>
        <ol className="mt-2 grid list-decimal grid-cols-1 gap-1 pl-5 text-sm sm:grid-cols-2">
          {doc.sections.map((s, i) => (
            <li key={i}>
              <a
                href={`#report-sec-${i + 1}`}
                className="text-foreground/80 hover:text-primary"
              >
                {s.heading}
              </a>
            </li>
          ))}
        </ol>
      </div>

      {doc.sections.map((section, i) => (
        <SectionView key={i} section={section} index={i + 1} />
      ))}

      <div className="flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
        <span>
          {doc.brand} · {doc.title}
        </span>
        <span>{doc.subtitle}</span>
      </div>
    </div>
  );
}

// --- Reporting center --------------------------------------------------------
export function ReportsTab({
  datasetId,
  datasetName,
}: {
  datasetId: string;
  datasetName?: string;
}) {
  const [type, setType] = React.useState<ProReportType>("executive");
  const { data: center } = useReportCenter(datasetId);
  const { data: doc, isLoading, isError } = useReportDocument(datasetId, type);
  const reportExporter = useReportExport(datasetId);
  const { data: formatsData } = useExportFormats(datasetId);
  const exporter = useExportFile(datasetId);
  const [pendingFormat, setPendingFormat] = React.useState<string | null>(null);
  const [pendingData, setPendingData] = React.useState<string | null>(null);

  const name = datasetName || "dataset";
  const availability = center?.formats ?? {};
  const active = REPORT_META[type];

  function handleReportExport(format: string) {
    const ext = EXPORT_EXT[format] ?? format;
    setPendingFormat(format);
    reportExporter.mutate(
      {
        type,
        format,
        filename: `${name}-${type.replace(/_/g, "-")}-report.${ext}`,
      },
      {
        onSuccess: () => toast.success(`${active.label} exported as ${ext.toUpperCase()}`),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Export failed"),
        onSettled: () => setPendingFormat(null),
      },
    );
  }

  function handleDataExport(format: string) {
    const meta = DATA_EXPORT_META[format];
    setPendingData(format);
    exporter.mutate(
      { format, filename: `${name}.${meta?.ext ?? format}` },
      {
        onSuccess: () => toast.success(`${meta?.label ?? format} downloaded`),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Export failed"),
        onSettled: () => setPendingData(null),
      },
    );
  }

  const dataFormats = (formatsData?.formats ?? []).filter(
    (f) => !["pdf", "powerpoint"].includes(f.id),
  );

  return (
    <div className="space-y-6">
      {/* Report type gallery */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {REPORT_ORDER.map((id) => {
          const meta = REPORT_META[id];
          const Icon = meta.icon;
          const isActive = id === type;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setType(id)}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                isActive
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "hover:border-primary/40 hover:bg-accent",
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg",
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="mt-3 text-sm font-semibold">{meta.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{meta.blurb}</div>
            </button>
          );
        })}
      </div>

      {/* Document preview + exports */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">{active.label}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{active.blurb}</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {EXPORT_BUTTONS.map(({ format, label, icon: Icon }) => {
              const ready = availability[format] !== false;
              const busy = pendingFormat === format;
              return (
                <Button
                  key={format}
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={!doc || !ready || busy}
                  onClick={() => handleReportExport(format)}
                  title={
                    ready ? `Export as ${label}` : `${label} export not available on the server`
                  }
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  {label}
                </Button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingLines count={10} />
          ) : isError || !doc ? (
            <EmptyState
              icon={FileText}
              title="Report unavailable"
              description="The dataset profile isn't ready yet. Open the Profile tab first, then return here."
            />
          ) : (
            <DocumentView doc={doc} />
          )}
        </CardContent>
      </Card>

      {/* Raw data export panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-primary" /> Export data & analysis
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Download the dataset and its analysis in your preferred format.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dataFormats.map((f) => {
              const meta = DATA_EXPORT_META[f.id] ?? { label: f.id, ext: f.id, hint: "" };
              const ready = f.status === "ready";
              const busy = pendingData === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={!ready || busy}
                  onClick={() => ready && handleDataExport(f.id)}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors",
                    ready
                      ? "hover:border-primary hover:bg-primary/5"
                      : "cursor-not-allowed opacity-60",
                  )}
                >
                  <div>
                    <div className="text-sm font-medium">{meta.label}</div>
                    <div className="text-xs text-muted-foreground">{meta.hint}</div>
                  </div>
                  {busy ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  ) : ready ? (
                    <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      soon
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
