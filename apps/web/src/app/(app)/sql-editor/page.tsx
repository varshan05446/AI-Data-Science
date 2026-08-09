"use client";

import { Play, TerminalSquare, AlertCircle, Loader2, Database, Clock, Rows3, ChevronDown, Check } from "lucide-react";
import * as React from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSqlDatasets, useExecuteSql } from "@/lib/hooks";
import type { SqlExecuteResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

function slugify(name: string) {
  return name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase() || "dataset";
}

export default function SqlEditorPage() {
  const { data: datasets, isLoading: loadingDatasets } = useSqlDatasets();
  const executeSql = useExecuteSql();

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState("-- Each selected dataset is loaded as a table named after the dataset\nSELECT * FROM your_table\nLIMIT 100;");
  const [result, setResult] = React.useState<SqlExecuteResponse | null>(null);
  const [showPicker, setShowPicker] = React.useState(false);
  const pickerRef = React.useRef<HTMLDivElement>(null);

  // Auto-select all datasets on load
  React.useEffect(() => {
    if (datasets && datasets.length > 0 && selectedIds.length === 0) {
      setSelectedIds(datasets.map((d) => d.id));
    }
  }, [datasets]);

  // Update query hint when selection changes
  React.useEffect(() => {
    if (!datasets || selectedIds.length === 0) return;
    const selected = datasets.filter((d) => selectedIds.includes(d.id));
    const tableLines = selected.map((d) => `--   ${slugify(d.name)}  (${d.rows?.toLocaleString() ?? "?"} rows × ${d.columns ?? "?"} cols)`).join("\n");
    setQuery(`-- Available tables:\n${tableLines}\n\nSELECT * FROM ${slugify(selected[0].name)}\nLIMIT 100;`);
  }, [selectedIds.join(","), datasets]);

  // Close picker on outside click
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggleDataset(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function runQuery() {
    if (selectedIds.length === 0) return;
    executeSql.mutate(
      { datasetIds: selectedIds, query },
      {
        onSuccess: (data) => setResult(data),
        onError: (err) =>
          setResult({ columns: [], rows: [], row_count: 0, truncated: false, execution_ms: 0, error: err.message }),
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); runQuery(); }
  }

  const selectedDatasets = datasets?.filter((d) => selectedIds.includes(d.id)) ?? [];

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="SQL Editor"
        description="Query one or more datasets using in-memory SQLite. Each dataset is a table."
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Ctrl+Enter to run</span>
            <Button onClick={runQuery} disabled={selectedIds.length === 0 || executeSql.isPending}>
              {executeSql.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run Query
            </Button>
          </div>
        }
      />

      {/* Dataset multi-selector */}
      <div className="flex flex-wrap items-center gap-2" ref={pickerRef}>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <Database className="h-4 w-4 text-primary" />
            <span className="font-medium">
              {selectedIds.length === 0
                ? "Select datasets"
                : selectedIds.length === 1
                ? selectedDatasets[0]?.name
                : `${selectedIds.length} datasets selected`}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>

          {showPicker && (
            <div className="absolute top-full left-0 z-50 mt-1 w-80 rounded-lg border bg-card shadow-lg">
              {loadingDatasets ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
              ) : datasets && datasets.length > 0 ? (
                <>
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground">Select tables to query</span>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => setSelectedIds(
                        selectedIds.length === datasets.length ? [] : datasets.map((d) => d.id)
                      )}
                    >
                      {selectedIds.length === datasets.length ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  <ul className="max-h-60 overflow-auto py-1">
                    {datasets.map((ds) => {
                      const checked = selectedIds.includes(ds.id);
                      return (
                        <li key={ds.id}>
                          <button
                            type="button"
                            onClick={() => toggleDataset(ds.id)}
                            className={cn(
                              "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent",
                              checked && "bg-accent/50"
                            )}
                          >
                            <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                              {checked && <Check className="h-3 w-3" />}
                            </span>
                            <div className="flex flex-1 items-center justify-between min-w-0">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{ds.name}</p>
                                <p className="text-xs text-muted-foreground font-mono">table: {slugify(ds.name)}</p>
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0 ml-2">
                                {ds.rows?.toLocaleString() ?? "?"} × {ds.columns ?? "?"}
                              </span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <div className="p-4 text-center text-sm text-muted-foreground">No datasets available.</div>
              )}
            </div>
          )}
        </div>

        {/* Table name badges */}
        {selectedDatasets.map((ds) => (
          <Badge key={ds.id} variant="secondary" className="font-mono text-xs">
            {slugify(ds.name)}
          </Badge>
        ))}
      </div>

      {/* Editor + Results */}
      <div className="flex flex-1 flex-col gap-3 lg:flex-row">
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-2 rounded-t-lg border border-b-0 bg-surface px-3 py-2">
            <TerminalSquare className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium">Query</span>
            {executeSql.isPending && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
          </div>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            className="flex-1 resize-none rounded-b-lg border bg-card p-4 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            rows={12}
          />
        </div>

        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between rounded-t-lg border border-b-0 bg-surface px-3 py-2">
            <span className="text-xs font-medium">Results</span>
            {result && !result.error && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Rows3 className="h-3 w-3" />{result.row_count.toLocaleString()} rows</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{result.execution_ms}ms</span>
                {result.truncated && <Badge variant="warning">Truncated</Badge>}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto rounded-b-lg border bg-card font-mono text-xs">
            {result ? (
              result.error ? (
                <div className="flex items-start gap-2 p-4 text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <pre className="whitespace-pre-wrap">{result.error}</pre>
                </div>
              ) : result.columns.length > 0 ? (
                <div className="overflow-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {result.columns.map((col) => (
                          <th key={col} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i} className="border-b transition-colors hover:bg-muted/30">
                          {result.columns.map((col) => (
                            <td key={col} className="px-3 py-1.5 text-foreground">
                              {row[col] === null ? (
                                <span className="text-muted-foreground/50">NULL</span>
                              ) : typeof row[col] === "object" ? (
                                JSON.stringify(row[col])
                              ) : (
                                String(row[col])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="p-4 text-center text-muted-foreground/60">Query returned no results.</p>
              )
            ) : (
              <p className="p-4 text-center text-muted-foreground/60">Run a query to see results here.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
