"use client";

/**
 * Notebook workspace: a Jupyter-style scratchpad wired to the backend's
 * pluggable executor. Code cells run Python against the dataset as `df` (with
 * pd/np/plt/sns/px/sklearn preloaded by the full executor); markdown cells hold
 * prose. A variable explorer shows what the latest run defined, and an
 * execution history tracks recent runs. State (the cell list) lives client-side
 * so a real kernel can be swapped in later without touching this component.
 */
import {
  Plus,
  PlayCircle,
  Loader2,
  Info,
  Terminal,
  Type,
  Clock,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import {
  NotebookCell,
  type CellKind,
  type NotebookCellData,
} from "@/components/dataset/notebook/notebook-cell";
import { VariableExplorer } from "@/components/dataset/notebook/variable-explorer";
import { Button } from "@/components/ui/button";
import { ResizablePanels } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { useExecuteCell, useNotebookAssist, useNotebookInfo } from "@/lib/hooks";
import type { NotebookVariable } from "@/lib/types";

interface RunLog {
  cell: number;
  ok: boolean;
  ms: number;
}

let cellSeq = 0;
function newCell(code = "", kind: CellKind = "code"): NotebookCellData {
  cellSeq += 1;
  return { id: `cell-${Date.now()}-${cellSeq}`, code, kind, running: false };
}

export function NotebookTab({ datasetId }: { datasetId: string }) {
  const { data: info, isLoading } = useNotebookInfo(datasetId);
  const execute = useExecuteCell(datasetId);
  const assist = useNotebookAssist(datasetId);
  const [cells, setCells] = React.useState<NotebookCellData[]>([]);
  const [seeded, setSeeded] = React.useState(false);
  const [variables, setVariables] = React.useState<NotebookVariable[]>([]);
  const [history, setHistory] = React.useState<RunLog[]>([]);
  const [assistingId, setAssistingId] = React.useState<string | null>(null);

  const available = info?.executor.available ?? false;

  // Seed the notebook once from the executor's starter cells.
  React.useEffect(() => {
    if (seeded || !info) return;
    const starters = info.starter_cells.length
      ? info.starter_cells
      : ["df.head()"];
    setCells(starters.map((c) => newCell(c)));
    setSeeded(true);
  }, [info, seeded]);

  const patch = React.useCallback(
    (id: string, next: Partial<NotebookCellData>) =>
      setCells((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...next } : c)),
      ),
    [],
  );

  const runCell = React.useCallback(
    async (id: string) => {
      const cell = cells.find((c) => c.id === id);
      if (!cell || cell.kind !== "code" || !cell.code.trim()) return;
      const index = cells.findIndex((c) => c.id === id);
      patch(id, { running: true });
      try {
        const result = await execute.mutateAsync(cell.code);
        patch(id, { running: false, result });
        if (result.variables?.length) setVariables(result.variables);
        setHistory((prev) =>
          [{ cell: index + 1, ok: result.ok, ms: result.execution_ms }, ...prev].slice(0, 12),
        );
      } catch (err) {
        patch(id, {
          running: false,
          result: {
            ok: false,
            outputs: [],
            stdout: "",
            execution_ms: 0,
            error: err instanceof Error ? err.message : "Execution failed.",
          },
        });
        toast.error("Cell failed to run.");
      }
    },
    [cells, execute, patch],
  );

  const runAll = React.useCallback(async () => {
    for (const cell of cells) {
      if (cell.kind === "code" && cell.code.trim()) await runCell(cell.id);
    }
  }, [cells, runCell]);

  const assistCell = React.useCallback(
    async (id: string) => {
      const cell = cells.find((c) => c.id === id);
      if (!cell) return;
      const failed =
        cell.result && !cell.result.ok ? cell.result.error ?? undefined : undefined;
      const entered = window.prompt(
        failed
          ? "Describe the fix (the error will be included automatically):"
          : "Describe what this cell should do (e.g. 'rank sales by region'):",
        "",
      );
      if (entered === null) return; // cancelled
      const prompt = entered.trim() || cell.code;
      setAssistingId(id);
      try {
        const { code } = await assist.mutateAsync({ prompt, error: failed });
        if (code) patch(id, { code });
        else toast.info("Couldn't generate code for that prompt — try rephrasing.");
      } catch {
        toast.error("AI assist failed.");
      } finally {
        setAssistingId(null);
      }
    },
    [cells, assist, patch],
  );

  const addCell = (kind: CellKind = "code") =>
    setCells((prev) => [...prev, newCell("", kind)]);

  const deleteCell = (id: string) =>
    setCells((prev) => prev.filter((c) => c.id !== id));

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Executor banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-start gap-2 text-sm">
          <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">
              Executor:{" "}
              <span className="font-mono">{info?.executor.name ?? "—"}</span>
              {available ? (
                <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  ready
                </span>
              ) : (
                <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  unavailable
                </span>
              )}
            </p>
            {info?.executor.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {info.executor.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runAll}
            disabled={!available || execute.isPending}
          >
            {execute.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="mr-1.5 h-4 w-4" />
            )}
            Run all
          </Button>
          <Button variant="outline" size="sm" onClick={() => addCell("code")}>
            <Plus className="mr-1.5 h-4 w-4" />
            Code
          </Button>
          <Button variant="outline" size="sm" onClick={() => addCell("markdown")}>
            <Type className="mr-1.5 h-4 w-4" />
            Text
          </Button>
        </div>
      </div>

      {/* Available columns hint */}
      {info?.columns?.length ? (
        <div className="flex items-start gap-2 rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            <span className="font-medium text-foreground">df</span> has{" "}
            {info.columns.length} columns:{" "}
            <span className="font-mono">{info.columns.join(", ")}</span>
          </p>
        </div>
      ) : null}

      {/* Cells | Sidebar */}
      <ResizablePanels
        storageKey="notebook-split"
        defaultLeft={70}
        min={55}
        max={82}
        left={
          <div className="space-y-3">
            {cells.map((cell, i) => (
              <NotebookCell
                key={cell.id}
                cell={cell}
                index={i}
                disabled={!available}
                assisting={assistingId === cell.id}
                onChange={(code) => patch(cell.id, { code })}
                onRun={() => runCell(cell.id)}
                onDelete={() => deleteCell(cell.id)}
                onAssist={available ? () => assistCell(cell.id) : undefined}
              />
            ))}
            {cells.length === 0 && (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No cells yet. Add a{" "}
                <span className="font-medium text-foreground">Code</span> or{" "}
                <span className="font-medium text-foreground">Text</span> cell to
                start exploring.
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => addCell("code")}
              className="w-full"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add code cell
            </Button>
          </div>
        }
        right={
          <div className="space-y-4">
            <VariableExplorer variables={variables} />
            {history.length > 0 && (
              <div className="rounded-lg border bg-card">
                <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Execution history
                </div>
                <ul className="max-h-52 divide-y overflow-auto scrollbar-thin text-xs">
                  {history.map((h, i) => (
                    <li key={i} className="flex items-center justify-between px-3 py-1.5">
                      <span className="font-mono text-muted-foreground">[{h.cell}]</span>
                      <span
                        className={
                          h.ok
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-destructive"
                        }
                      >
                        {h.ok ? "ok" : "error"}
                      </span>
                      <span className="text-muted-foreground">{h.ms} ms</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        }
      />
    </div>
  );
}
