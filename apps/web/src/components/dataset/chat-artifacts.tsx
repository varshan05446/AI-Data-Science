"use client";

/**
 * Renders the structured artefacts an assistant message can carry (see the
 * backend `expert_answer` payload): interpreted-typo corrections, a computed
 * data table, a chart spec (routed through the premium shared ChartFrame),
 * a suggestion checklist, and generated SQL/Python with copy-to-clipboard.
 */
import { ListChecks, WandSparkles } from "lucide-react";

import { ChartFrame } from "@/components/charts/chart-frame";
import { CopyButton } from "@/components/shared/copy-button";
import type { ChatPayload } from "@/lib/types";

function CorrectionNote({ corrections }: { corrections: NonNullable<ChatPayload["corrections"]> }) {
  if (!corrections.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <WandSparkles className="h-3 w-3 text-primary" />
      <span>Interpreted</span>
      {corrections.map((c) => (
        <span key={`${c.from}-${c.to}`} className="rounded bg-muted px-1.5 py-0.5">
          <span className="line-through opacity-60">{c.from}</span>
          {" → "}
          <span className="font-medium text-foreground">{c.to}</span>
        </span>
      ))}
    </div>
  );
}

function ArtifactTable({ table }: { table: NonNullable<ChatPayload["table"]> }) {
  const { columns, rows } = table;
  if (!columns.length || !rows.length) return null;

  function downloadCsv() {
    const header = columns.join(",");
    const body = rows
      .map((r) =>
        columns
          .map((c) => {
            const v = r[c];
            const s = v == null ? "" : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "result.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-3 rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Result · {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
        <CopyButton value={downloadableText(columns, rows)} label="Copy" />
      </div>
      <div className="max-h-72 overflow-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 backdrop-blur">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 text-left font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t hover:bg-muted/30">
                {columns.map((c) => (
                  <td key={c} className="px-3 py-1.5 font-mono text-xs">
                    {formatCell(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end border-t px-3 py-1.5">
        <button
          type="button"
          onClick={downloadCsv}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Download CSV
        </button>
      </div>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number")
    return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(v);
}

function downloadableText(columns: string[], rows: Record<string, unknown>[]): string {
  return [columns.join("\t"), ...rows.map((r) => columns.map((c) => formatCell(r[c])).join("\t"))].join("\n");
}

function CodeArtifact({ code }: { code: NonNullable<ChatPayload["code"]> }) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-white/50">
          {code.language}
        </span>
        <CopyButton
          value={code.content}
          className="border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
        />
      </div>
      <pre className="overflow-x-auto scrollbar-thin p-3 text-xs leading-relaxed text-[#e6edf3]">
        <code>{code.content}</code>
      </pre>
    </div>
  );
}

function ChecklistArtifact({ items }: { items: string[] }) {
  if (!items.length) return null;
  // Items may arrive as markdown bullets ("- **x:** y"); strip a leading dash.
  const clean = items.map((s) => s.replace(/^\s*-\s*/, ""));
  return (
    <div className="mt-3 rounded-lg border bg-background p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5 text-primary" />
        Suggestions
      </div>
      <ul className="space-y-1.5 text-sm">
        {clean.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
            <span dangerouslySetInnerHTML={{ __html: mdBold(item) }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function mdBold(s: string): string {
  const escaped = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-xs">$1</code>');
}

export function ChatArtifacts({ payload }: { payload?: ChatPayload }) {
  if (!payload) return null;
  const { corrections, table, chart, code, checklist } = payload;
  const hasAny = corrections?.length || table || chart || code || checklist?.length;
  if (!hasAny) return null;

  return (
    <div className="mt-2 space-y-2">
      {corrections && corrections.length > 0 && (
        <CorrectionNote corrections={corrections} />
      )}
      {chart && <ChartFrame chart={chart} height={280} />}
      {table && <ArtifactTable table={table} />}
      {checklist && checklist.length > 0 && <ChecklistArtifact items={checklist} />}
      {code && <CodeArtifact code={code} />}
    </div>
  );
}
