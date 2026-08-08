"use client";

import { Play, TerminalSquare, AlertCircle, Loader2, Database, Clock, Rows3, ChevronDown } from "lucide-react";
import * as React from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSqlDatasets, useExecuteSql } from "@/lib/hooks";
import type { SqlExecuteResponse } from "@/lib/types";

export default function SqlEditorPage() {
  const { data: datasets, isLoading: loadingDatasets } = useSqlDatasets();
  const executeSql = useExecuteSql();

  const [selectedDataset, setSelectedDataset] = React.useState("");
  const [query, setQuery] = React.useState(
    "-- Write your SQL query here\n-- Table name is 'dataset'\nSELECT * FROM dataset\nLIMIT 100;",
  );
  const [result, setResult] = React.useState<SqlExecuteResponse | null>(null);
  const [showDatasetPicker, setShowDatasetPicker] = React.useState(false);

  React.useEffect(() => {
    if (datasets && datasets.length > 0 && !selectedDataset) {
      setSelectedDataset(datasets[0].id);
    }
  }, [datasets, selectedDataset]);

  function runQuery() {
    if (!selectedDataset) return;
    executeSql.mutate(
      { datasetId: selectedDataset, query },
      {
        onSuccess: (data) => setResult(data),
        onError: (err) =>
          setResult({
            columns: [],
            rows: [],
            row_count: 0,
            truncated: false,
            execution_ms: 0,
            error: err.message,
          }),
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    }
  }

  const selectedDs = datasets?.find((d) => d.id === selectedDataset);

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="SQL Editor"
        description="Write and run SQL queries against your datasets using an in-memory SQLite engine."
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Ctrl+Enter to run</span>
            <Button onClick={runQuery} disabled={!selectedDataset || executeSql.isPending}>
              {executeSql.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run Query
            </Button>
          </div>
        }
      />

      {/* Dataset selector */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowDatasetPicker(!showDatasetPicker)}
            className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <Database className="h-4 w-4 text-primary" />
            <span className="font-medium">
              {selectedDs ? selectedDs.name : "Select a dataset"}
            </span>
            {selectedDs && (
              <span className="text-xs text-muted-foreground">
                ({selectedDs.rows?.toLocaleString() ?? "?"} rows)
              </span>
            )}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
          {showDatasetPicker && (
            <div className="absolute top-full left-0 z-50 mt-1 w-72 rounded-lg border bg-card shadow-lg">
              {loadingDatasets ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Loading datasets...</div>
              ) : datasets && datasets.length > 0 ? (
                <ul className="max-h-60 overflow-auto py-1">
                  {datasets.map((ds) => (
                    <li key={ds.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDataset(ds.id);
                          setShowDatasetPicker(false);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-accent ${
                          ds.id === selectedDataset ? "bg-accent" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Database className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{ds.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{ds.columns ?? "?"} cols</span>
                          <span>·</span>
                          <span>{ds.rows?.toLocaleString() ?? "?"} rows</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No datasets available. Upload a dataset first.
                </div>
              )}
            </div>
          )}
        </div>
        {selectedDs && (
          <Badge variant="secondary">
            <Rows3 className="mr-1 h-3 w-3" />
            {selectedDs.rows?.toLocaleString() ?? "?"} rows × {selectedDs.columns ?? "?"} cols
          </Badge>
        )}
      </div>

      {/* Editor area */}
      <div className="flex flex-1 flex-col gap-3 lg:flex-row">
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-2 rounded-t-lg border border-b-0 bg-surface px-3 py-2">
            <TerminalSquare className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium">Query</span>
            {executeSql.isPending && (
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            )}
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

        {/* Results pane */}
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between rounded-t-lg border border-b-0 bg-surface px-3 py-2">
            <span className="text-xs font-medium">Results</span>
            {result && !result.error && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Rows3 className="h-3 w-3" />
                  {result.row_count.toLocaleString()} rows
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {result.execution_ms}ms
                </span>
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
                          <th
                            key={col}
                            className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                          >
                            {col}
                          </th>
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
              <p className="p-4 text-center text-muted-foreground/60">
                Run a query to see results here.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
