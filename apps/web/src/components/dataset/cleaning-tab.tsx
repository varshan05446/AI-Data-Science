"use client";

/**
 * Data Cleaning workspace — a Power Query-style, non-destructive preparation
 * surface. Operations append to a reproducible pipeline that replays over the
 * original file, giving instant preview, undo/redo and named version history.
 * "Save cleaned dataset" materialises the result as a new dataset in the
 * project (so it flows through profiling, EDA, notebook and models unchanged).
 */
import {
  History,
  Layers,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { CleaningGrid } from "@/components/dataset/cleaning/cleaning-grid";
import { OperationDialog } from "@/components/dataset/cleaning/operation-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingLines } from "@/components/shared/loading";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownItem,
  DropdownMenu,
} from "@/components/ui/dropdown-menu";
import { ApiError } from "@/lib/api";
import {
  useCleaningActions,
  useCleaningOperations,
  useCleaningState,
} from "@/lib/hooks";
import type { CleaningOperation, CleaningOperationGroup } from "@/lib/types";
import { formatBytes, formatNumber } from "@/lib/utils";

function useOperationSplit(groups: CleaningOperationGroup[] | undefined) {
  return React.useMemo(() => {
    const columnGroups: CleaningOperationGroup[] = [];
    const datasetOps: CleaningOperation[] = [];
    for (const g of groups ?? []) {
      const colOps = g.operations.filter((o) => o.scope === "column");
      if (colOps.length) columnGroups.push({ group: g.group, operations: colOps });
      for (const o of g.operations) if (o.scope === "dataset") datasetOps.push(o);
    }
    return { columnGroups, datasetOps };
  }, [groups]);
}

export function CleaningTab({ datasetId }: { datasetId: string }) {
  const router = useRouter();
  const { data: state, isLoading, isError } = useCleaningState(datasetId);
  const { data: opsData } = useCleaningOperations(datasetId);
  const actions = useCleaningActions(datasetId);
  const { columnGroups, datasetOps } = useOperationSplit(opsData?.catalog);

  const [dialogOp, setDialogOp] = React.useState<CleaningOperation | null>(null);
  const [dialogColumn, setDialogColumn] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const busy =
    actions.apply.isPending ||
    actions.undo.isPending ||
    actions.redo.isPending ||
    actions.reset.isPending ||
    actions.restoreVersion.isPending;

  function onError(err: unknown) {
    const msg = err instanceof ApiError ? err.message : "Operation failed";
    toast.error(msg);
  }

  function pickOperation(op: CleaningOperation, column: string | null) {
    if (op.params.length === 0) {
      actions.apply.mutate(
        { op: op.op, column, params: {} },
        { onError },
      );
      return;
    }
    setDialogOp(op);
    setDialogColumn(column);
    setDialogOpen(true);
  }

  function applyWithParams(params: Record<string, unknown>) {
    if (!dialogOp) return;
    actions.apply.mutate(
      { op: dialogOp.op, column: dialogColumn, params },
      {
        onSuccess: () => setDialogOpen(false),
        onError,
      },
    );
  }

  function saveVersion() {
    const label = window.prompt("Name this version", `Version ${(state?.versions.length ?? 0) + 1}`);
    if (label == null) return;
    actions.saveVersion.mutate(label || "Snapshot", {
      onSuccess: () => toast.success("Version saved"),
      onError,
    });
  }

  function commit() {
    const name = window.prompt(
      "Save the cleaned data as a new dataset. Name:",
      undefined,
    );
    if (name == null) return;
    actions.commit.mutate(name || undefined, {
      onSuccess: (ds) => {
        toast.success(`Created “${ds.name}”`);
        router.push(`/datasets/${ds.id}`);
      },
      onError,
    });
  }

  if (isLoading) return <LoadingLines count={8} />;
  if (isError || !state) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Cleaning workspace unavailable"
        description="We couldn't load this dataset's file for cleaning. Re-upload it and try again."
      />
    );
  }

  const p = state.preview;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu
          align="start"
          trigger={
            <Button variant="default" size="sm" disabled={busy}>
              <Plus className="h-4 w-4" /> Add step
            </Button>
          }
        >
          {datasetOps.length === 0 && (
            <DropdownItem disabled>No dataset-level steps</DropdownItem>
          )}
          {datasetOps.map((op) => (
            <DropdownItem key={op.op} onClick={() => pickOperation(op, null)}>
              {op.label}
            </DropdownItem>
          ))}
        </DropdownMenu>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!state.can_undo || busy}
            onClick={() => actions.undo.mutate(undefined, { onError })}
          >
            <Undo2 className="h-4 w-4" /> Undo
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!state.can_redo || busy}
            onClick={() => actions.redo.mutate(undefined, { onError })}
          >
            <Redo2 className="h-4 w-4" /> Redo
          </Button>
        </div>

        <Button variant="outline" size="sm" onClick={saveVersion} disabled={busy}>
          <Save className="h-4 w-4" /> Save version
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={state.steps.length === 0 || busy}
          onClick={() =>
            actions.reset.mutate(undefined, {
              onSuccess: () => toast.success("Pipeline cleared"),
              onError,
            })
          }
        >
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>

        <div className="ml-auto">
          <Button size="sm" onClick={commit} disabled={actions.commit.isPending}>
            <Sparkles className="h-4 w-4" />
            {actions.commit.isPending ? "Saving…" : "Save cleaned dataset"}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Rows" value={formatNumber(p.shape.rows)} />
        <StatCard label="Columns" value={formatNumber(p.shape.columns)} />
        <StatCard
          label="Duplicate rows"
          value={formatNumber(p.duplicate_rows)}
          accent={p.duplicate_rows > 0 ? "warning" : "success"}
        />
        <StatCard label="Memory" value={formatBytes(p.memory_bytes)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        {/* Grid */}
        <div className="min-w-0 space-y-2">
          <div className="max-h-[32rem] overflow-hidden">
            <CleaningGrid
              preview={p}
              columnOperations={columnGroups}
              onPick={(op, column) => pickOperation(op, column)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Showing the first {p.rows.length} rows of the working preview. Use each
            column&apos;s menu to apply cleaning operations.
          </p>
        </div>

        {/* History + versions */}
        <div className="space-y-4">
          <div className="rounded-lg border">
            <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
              <History className="h-4 w-4 text-primary" /> Pipeline
              <Badge variant="secondary" className="ml-auto">
                {state.steps.length}
              </Badge>
            </div>
            <div className="max-h-64 space-y-1 overflow-auto p-2">
              {state.steps.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  No steps yet. Applied operations appear here in order.
                </p>
              ) : (
                state.steps.map((step, i) => (
                  <div
                    key={step.id}
                    className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                  >
                    <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                      {i + 1}
                    </span>
                    <span className="min-w-0 break-words">{step.label}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border">
            <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
              <Layers className="h-4 w-4 text-primary" /> Versions
              <Badge variant="secondary" className="ml-auto">
                {state.versions.length}
              </Badge>
            </div>
            <div className="max-h-48 space-y-1 overflow-auto p-2">
              {state.versions.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  Save a version to snapshot the current pipeline.
                </p>
              ) : (
                state.versions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      actions.restoreVersion.mutate(v.id, {
                        onSuccess: () => toast.success(`Restored “${v.label}”`),
                        onError,
                      })
                    }
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate">{v.label}</span>
                    <span className="flex-none text-[10px] text-muted-foreground">
                      {v.step_count} step{v.step_count === 1 ? "" : "s"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <OperationDialog
        operation={dialogOp}
        column={dialogColumn}
        columns={p.column_order}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onApply={applyWithParams}
        pending={actions.apply.isPending}
      />
    </div>
  );
}
