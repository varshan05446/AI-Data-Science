"use client";

/**
 * Power Query-style spreadsheet grid. Each column header surfaces its type,
 * missing %, unique count and memory, plus a dropdown of column-scoped cleaning
 * operations. The body renders the working preview (first rows of the replayed
 * pipeline). Picking an operation is delegated to the parent workspace.
 */
import { ChevronDown } from "lucide-react";

import {
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
} from "@/components/ui/dropdown-menu";
import type {
  CleaningColumn,
  CleaningOperation,
  CleaningOperationGroup,
  CleaningPreview,
} from "@/lib/types";
import { cn, formatBytes, formatNumber } from "@/lib/utils";

const TYPE_STYLES: Record<string, string> = {
  numeric: "text-sky-600 dark:text-sky-400",
  categorical: "text-violet-600 dark:text-violet-400",
  datetime: "text-amber-600 dark:text-amber-400",
  boolean: "text-emerald-600 dark:text-emerald-400",
  text: "text-muted-foreground",
};

function MissingBar({ pct }: { pct: number }) {
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full", pct > 20 ? "bg-warning" : "bg-primary/50")}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

function ColumnHeader({
  col,
  groups,
  onPick,
  align = "end",
}: {
  col: CleaningColumn;
  groups: CleaningOperationGroup[];
  onPick: (op: CleaningOperation, column: string) => void;
  align?: "start" | "end";
}) {
  return (
    <th className="min-w-[180px] border-b border-r bg-muted/40 p-2 text-left align-top">
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="truncate font-medium" title={col.name}>
            {col.name}
          </div>
          <div className={cn("text-[11px] font-medium capitalize", TYPE_STYLES[col.semantic_type])}>
            {col.semantic_type}
          </div>
        </div>
        <DropdownMenu
          align={align}
          trigger={
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Operations for ${col.name}`}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          }
          className="max-h-80 min-w-[15rem] overflow-auto"
        >
          {groups.map((group) => (
            <div key={group.group}>
              <DropdownLabel>{group.group}</DropdownLabel>
              {group.operations.map((op) => (
                <DropdownItem key={op.op} onClick={() => onPick(op, col.name)}>
                  {op.label}
                </DropdownItem>
              ))}
              <DropdownSeparator />
            </div>
          ))}
        </DropdownMenu>
      </div>

      <dl className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
        <div className="flex justify-between">
          <dt>Missing</dt>
          <dd className={col.missing_pct > 20 ? "text-warning" : undefined}>
            {col.missing_pct.toFixed(1)}%
          </dd>
        </div>
        <MissingBar pct={col.missing_pct} />
        <div className="flex justify-between pt-1">
          <dt>Unique</dt>
          <dd>{formatNumber(col.unique)}</dd>
        </div>
        {col.stats?.outliers != null && (
          <div className="flex justify-between">
            <dt>Outliers</dt>
            <dd>{formatNumber(col.stats.outliers)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt>Memory</dt>
          <dd>{formatBytes(col.memory_bytes)}</dd>
        </div>
      </dl>
    </th>
  );
}

export function CleaningGrid({
  preview,
  columnOperations,
  onPick,
}: {
  preview: CleaningPreview;
  columnOperations: CleaningOperationGroup[];
  onPick: (op: CleaningOperation, column: string) => void;
}) {
  const { column_order, columns, rows } = preview;
  const byName = new Map(columns.map((c) => [c.name, c]));

  return (
    <div className="overflow-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-30">
          <tr>
            <th className="sticky left-0 z-40 w-12 border-b border-r bg-muted/60 p-2 text-center text-[11px] text-muted-foreground">
              #
            </th>
            {column_order.map((name, index) => {
              const col = byName.get(name);
              if (!col) return null;
              return (
                <ColumnHeader
                  key={name}
                  col={col}
                  groups={columnOperations}
                  onPick={onPick}
                  align={index === 0 ? "start" : "end"}
                />
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="odd:bg-muted/20 hover:bg-accent/40">
              <td className="sticky left-0 z-10 border-b border-r bg-background/95 p-2 text-center text-[11px] text-muted-foreground">
                {i + 1}
              </td>
              {column_order.map((name) => {
                const v = row[name];
                const empty = v === null || v === undefined || v === "";
                return (
                  <td
                    key={name}
                    className="max-w-[240px] truncate border-b border-r px-2 py-1.5"
                    title={empty ? "" : String(v)}
                  >
                    {empty ? (
                      <span className="text-xs italic text-muted-foreground/60">null</span>
                    ) : (
                      String(v)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
