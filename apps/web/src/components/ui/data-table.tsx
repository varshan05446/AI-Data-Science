"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Search,
} from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Cell renderer. Defaults to the string form of `sortValue`. */
  cell?: (row: T) => React.ReactNode;
  /** Value used for sorting and text filtering. Presence enables sorting. */
  sortValue?: (row: T) => string | number;
  /** Initial column width in pixels. */
  width?: number;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
}

export interface DataTableAction<T> {
  label: string;
  onClick: (row: T) => void;
  destructive?: boolean;
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

/**
 * An enterprise data table: sticky header, click-to-sort columns, a text
 * filter, client-side pagination, drag-to-resize columns, compact density,
 * row hover, and an optional right-click context menu. Fully generic over the
 * row type via `columns[]` + `rows[]`. Purely presentational — sorting,
 * filtering and paging happen client-side over the provided rows.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  rowActions,
  searchable = true,
  searchPlaceholder = "Filter…",
  pageSize = 10,
  emptyState,
  className,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowActions?: DataTableAction<T>[];
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  emptyState?: React.ReactNode;
  className?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortState>(null);
  const [page, setPage] = React.useState(0);
  const [widths, setWidths] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(columns.map((c) => [c.key, c.width ?? 160])),
  );
  const [menu, setMenu] = React.useState<{
    x: number;
    y: number;
    row: T;
  } | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const cellText = React.useCallback(
    (col: DataTableColumn<T>, row: T) =>
      col.sortValue ? String(col.sortValue(row)) : "",
    [],
  );

  // Filter across every column that exposes a sortValue.
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((c) => cellText(c, row).toLowerCase().includes(q)),
    );
  }, [rows, columns, query, cellText]);

  const sorted = React.useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === "number" && typeof bv === "number")
        return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const paged = sorted.slice(current * pageSize, current * pageSize + pageSize);

  React.useEffect(() => {
    setPage(0);
  }, [query, sort]);

  // Keep the fixed-position context menu fully inside the viewport: rows
  // near the right/bottom edge would otherwise render the menu off-screen.
  React.useLayoutEffect(() => {
    const el = menuRef.current;
    if (!menu || !el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    // Single monotonic clamp: shift left/up when overflowing the right/bottom
    // edge, shift right/down when overflowing the left/top edge. One-shot and
    // convergent even when the menu is wider than the viewport.
    const dx = Math.max(
      pad - r.left,
      Math.min(0, window.innerWidth - pad - r.right),
    );
    const dy = Math.max(
      pad - r.top,
      Math.min(0, window.innerHeight - pad - r.bottom),
    );
    if (dx !== 0 || dy !== 0) {
      setMenu((m) => (m ? { ...m, x: m.x + dx, y: m.y + dy } : m));
    }
  }, [menu]);

  // Close the context menu on any outside interaction.
  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  function toggleSort(col: DataTableColumn<T>) {
    if (!col.sortValue) return;
    setSort((s) => {
      if (s?.key !== col.key) return { key: col.key, dir: "asc" };
      if (s.dir === "asc") return { key: col.key, dir: "desc" };
      return null;
    });
  }

  function startResize(key: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key] ?? 160;
    function onMove(ev: MouseEvent) {
      const next = Math.max(80, startW + (ev.clientX - startX));
      setWidths((w) => ({ ...w, [key]: next }));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
  }

  return (
    <div className={cn("space-y-3", className)}>
      {searchable && (
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Filter table"
          />
        </div>
      )}

      <div className="overflow-auto rounded-lg border border-border/70 scrollbar-thin">
        <table className="w-full caption-bottom text-sm" style={{ tableLayout: "fixed" }}>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-border">
              {columns.map((col) => {
                const active = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    style={{ width: widths[col.key] }}
                    className={cn(
                      "relative h-9 select-none px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.headerClassName,
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col)}
                      disabled={!col.sortValue}
                      className={cn(
                        "inline-flex items-center gap-1 uppercase tracking-wide",
                        col.sortValue
                          ? "transition-colors hover:text-foreground"
                          : "cursor-default",
                        col.align === "right" && "flex-row-reverse",
                      )}
                    >
                      {col.header}
                      {col.sortValue &&
                        (active ? (
                          sort!.dir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        ))}
                    </button>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      onMouseDown={(e) => startResize(col.key, e)}
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40"
                    />
                  </th>
                );
              })}
              {rowActions && rowActions.length > 0 && (
                <th className="w-10 px-3" aria-label="Actions" />
              )}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (rowActions ? 1 : 0)}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyState ?? "No results."}
                </td>
              </tr>
            ) : (
              paged.map((row) => (
                <tr
                  key={getRowId(row)}
                  onClick={() => onRowClick?.(row)}
                  onContextMenu={(e) => {
                    if (!rowActions?.length) return;
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, row });
                  }}
                  className={cn(
                    "border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={{ width: widths[col.key] }}
                      className={cn(
                        "truncate px-3 py-2 align-middle",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
                        col.className,
                      )}
                    >
                      {col.cell ? col.cell(row) : cellText(col, row)}
                    </td>
                  ))}
                  {rowActions && rowActions.length > 0 && (
                    <td className="px-3 py-2 text-right">
                      <ContextTrigger
                        onOpen={(x, y) => setMenu({ x, y, row })}
                      />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > pageSize && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {current * pageSize + 1}–
            {Math.min((current + 1) * pageSize, sorted.length)} of{" "}
            {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={current === 0}
              className="rounded-md border border-input px-2 py-1 transition-colors hover:bg-accent disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-1">
              {current + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={current >= pageCount - 1}
              className="rounded-md border border-input px-2 py-1 transition-colors hover:bg-accent disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {menu && rowActions && (
        <div
          ref={menuRef}
          role="menu"
          style={{ top: menu.y, left: menu.x }}
          className="fixed z-50 min-w-[10rem] rounded-md border border-border bg-popover p-1 text-sm shadow-lg animate-fade"
          onClick={(e) => e.stopPropagation()}
        >
          {rowActions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => {
                action.onClick(menu.row);
                setMenu(null);
              }}
              className={cn(
                "flex w-full items-center rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-accent",
                action.destructive && "text-destructive hover:bg-destructive/10",
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The compact “⋯” button that opens the row context menu at its position. */
function ContextTrigger({
  onOpen,
}: {
  onOpen: (x: number, y: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Row actions"
      onClick={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        onOpen(r.right, r.bottom);
      }}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <span className="text-base leading-none">⋯</span>
    </button>
  );
}
