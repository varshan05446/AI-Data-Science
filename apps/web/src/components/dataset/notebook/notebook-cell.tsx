"use client";

/**
 * A single notebook cell. Code cells hold Python that runs against the dataset
 * as `df`; markdown cells render prose. Run code with the button or
 * Shift/Ctrl+Enter. Outputs mirror the executor's shape — tables render as a
 * scrollable grid, text/stdout as <pre>, matplotlib figures as images, and
 * errors in red. Code cells also expose an AI-assist button that generates or
 * fixes the cell via the backend analyst.
 */
import { Play, Trash2, Loader2, Sparkles, Pencil, Check } from "lucide-react";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { NotebookExecuteResult, NotebookOutput } from "@/lib/types";
import { cn } from "@/lib/utils";

export type CellKind = "code" | "markdown";

export interface NotebookCellData {
  id: string;
  code: string;
  kind: CellKind;
  result?: NotebookExecuteResult;
  running: boolean;
}

function OutputTable({ output }: { output: NotebookOutput }) {
  return (
    <div className="max-h-80 overflow-auto rounded-md border scrollbar-thin">
      <Table>
        <TableHeader>
          <TableRow>
            {output.columns.map((c) => (
              <TableHead key={c} className="whitespace-nowrap">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {output.rows.map((row, i) => (
            <TableRow key={i}>
              {output.columns.map((c) => {
                const v = row[c];
                const empty = v === null || v === undefined || v === "";
                return (
                  <TableCell key={c} className="whitespace-nowrap font-mono text-xs">
                    {empty ? (
                      <span className="italic text-muted-foreground/60">null</span>
                    ) : (
                      String(v)
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function OutputImage({ output }: { output: NotebookOutput }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`data:image/png;base64,${output.image ?? ""}`}
      alt="Figure output"
      className="max-w-full rounded-md border bg-white"
    />
  );
}

function CellOutput({ result }: { result: NotebookExecuteResult }) {
  return (
    <div className="space-y-2 border-t bg-muted/20 p-3">
      {result.stdout && (
        <pre className="overflow-auto scrollbar-thin rounded bg-background/60 p-2 text-xs">
          {result.stdout}
        </pre>
      )}
      {result.outputs.map((o, i) => {
        if (o.type === "table") return <OutputTable key={i} output={o} />;
        if (o.type === "image") return <OutputImage key={i} output={o} />;
        return (
          <pre
            key={i}
            className="overflow-auto scrollbar-thin rounded bg-background/60 p-2 font-mono text-xs"
          >
            {o.text}
          </pre>
        );
      })}
      {!result.ok && result.error && (
        <pre className="overflow-auto scrollbar-thin rounded border border-destructive/30 bg-destructive/10 p-2 font-mono text-xs text-destructive">
          {result.error}
        </pre>
      )}
      {result.ok &&
        result.outputs.length === 0 &&
        !result.stdout && (
          <p className="text-xs text-muted-foreground">
            Ran in {result.execution_ms} ms · no output.
          </p>
        )}
      {result.ok && (result.outputs.length > 0 || result.stdout) && (
        <p className="text-right text-[10px] text-muted-foreground">
          {result.execution_ms} ms
        </p>
      )}
    </div>
  );
}

function MarkdownCell({
  cell,
  onChange,
  onDelete,
}: {
  cell: NotebookCellData;
  onChange: (code: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = React.useState(!cell.code.trim());
  return (
    <div className="group overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">Markdown</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            title={editing ? "Done" : "Edit"}
            className="rounded p-1 hover:bg-accent"
          >
            {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete cell"
            className="rounded p-1 hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {editing ? (
        <textarea
          value={cell.code}
          spellCheck={false}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => cell.code.trim() && setEditing(false)}
          rows={Math.min(12, Math.max(2, cell.code.split("\n").length))}
          placeholder="# Heading, **notes**, insights…"
          className="w-full resize-y bg-transparent p-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60"
        />
      ) : (
        <div
          className="prose prose-sm max-w-none p-3 dark:prose-invert"
          onDoubleClick={() => setEditing(true)}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {cell.code || "_Empty markdown cell — double-click to edit._"}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export function NotebookCell({
  cell,
  index,
  disabled,
  assisting,
  onChange,
  onRun,
  onDelete,
  onAssist,
}: {
  cell: NotebookCellData;
  index: number;
  disabled?: boolean;
  assisting?: boolean;
  onChange: (code: string) => void;
  onRun: () => void;
  onDelete: () => void;
  onAssist?: () => void;
}) {
  if (cell.kind === "markdown") {
    return <MarkdownCell cell={cell} onChange={onChange} onDelete={onDelete} />;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.shiftKey || e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onRun();
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-stretch">
        <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-muted/30 py-2 text-[11px] text-muted-foreground">
          <span className="font-mono">[{index + 1}]</span>
        </div>
        <textarea
          value={cell.code}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={Math.min(12, Math.max(2, cell.code.split("\n").length))}
          placeholder="df.head()   —   Shift+Enter to run"
          className="min-h-[44px] flex-1 resize-y bg-transparent p-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60"
        />
        <div className="flex shrink-0 flex-col gap-1 border-l p-1.5">
          <button
            type="button"
            onClick={onRun}
            disabled={disabled || cell.running}
            title="Run cell (Shift+Enter)"
            className={cn(
              "rounded p-1.5 transition-colors",
              disabled
                ? "cursor-not-allowed text-muted-foreground/40"
                : "text-primary hover:bg-primary/10",
            )}
          >
            {cell.running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>
          {onAssist && (
            <button
              type="button"
              onClick={onAssist}
              disabled={assisting}
              title="AI assist — generate or fix this cell"
              className="rounded p-1.5 text-violet-500 transition-colors hover:bg-violet-500/10 disabled:opacity-50"
            >
              {assisting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            title="Delete cell"
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {cell.result && <CellOutput result={cell.result} />}
    </div>
  );
}
