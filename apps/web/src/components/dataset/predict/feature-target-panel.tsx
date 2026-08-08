"use client";

/**
 * Feature / Target Selection Step 1:
 * Two side-by-side panels:
 * LEFT: Input Features (X) with checkboxes, Select All, Clear All, Recommended, search & datatype filters.
 * RIGHT: Target Variable (Y) with radio pick. Automatically prevents target from being in X.
 */
import {
  AlertTriangle,
  CheckSquare,
  Crosshair,
  ListChecks,
  Search,
  Sparkles,
  Square,
  Filter,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModelColumnInfo, ModelConfig } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface FeatureTargetValue {
  target: string;
  features: string[];
}

/** Columns worth using as inputs: informative, mostly present, not id-like. */
export function recommendFeatures(
  columns: ModelColumnInfo[],
  target: string,
): string[] {
  return columns
    .filter((c) => {
      if (c.name === target) return false;
      if (c.missing_pct > 50) return false; // mostly empty
      if (c.unique <= 1) return false; // constant
      if (c.semantic_type === "id") return false; // identifier, pure noise
      return true;
    })
    .map((c) => c.name);
}

function typeBadge(semantic: string): string {
  const map: Record<string, string> = {
    numeric: "Numeric",
    categorical: "Categorical",
    boolean: "Boolean",
    datetime: "Datetime",
    text: "Text",
    id: "ID",
  };
  return map[semantic] ?? semantic;
}

const DATATYPE_FILTERS = ["all", "numeric", "categorical", "datetime", "boolean"] as const;

export function FeatureTargetPanel({
  config,
  target,
  features,
  onChange,
}: {
  config: ModelConfig;
  target: string;
  features: string[];
  onChange: (patch: Partial<FeatureTargetValue>) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");

  const columns = config.columns;

  const visible = columns.filter((c) => {
    if (typeFilter !== "all") {
      if (typeFilter === "numeric" && c.semantic_type !== "numeric") return false;
      if (typeFilter === "categorical" && c.semantic_type !== "categorical" && c.semantic_type !== "text") return false;
      if (typeFilter === "datetime" && c.semantic_type !== "datetime") return false;
      if (typeFilter === "boolean" && c.semantic_type !== "boolean") return false;
    }
    if (query && !c.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const leakage = target !== "" && features.includes(target);
  const recommended = React.useMemo(
    () => recommendFeatures(columns, target),
    [columns, target],
  );

  const suggestionFor = (name: string) =>
    config.target_suggestions?.find((s) => s.column === name);

  function toggleFeature(name: string) {
    if (name === target) return; // target cannot be in X
    onChange({
      features: features.includes(name)
        ? features.filter((f) => f !== name)
        : [...features, name],
    });
  }

  function pickTarget(name: string) {
    // Selecting Y automatically removes it from X (leakage guard)
    onChange({ target: name, features: features.filter((f) => f !== name) });
  }

  return (
    <div className="space-y-4">
      {/* Top Filter & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border/70 p-3 rounded-xl shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dataset columns…"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
          <span className="text-muted-foreground text-[11px] font-medium mr-1">Datatype:</span>
          {DATATYPE_FILTERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors capitalize",
                typeFilter === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground border-border/60 hover:bg-accent hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {leakage && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Data leakage warning: <strong>{target}</strong> was selected as target (Y) but remained in Input Features (X).
            It has been auto-removed from X.
          </span>
          <button
            type="button"
            onClick={() => onChange({ features: features.filter((f) => f !== target) })}
            className="ml-auto rounded-md border border-amber-500/50 px-2 py-0.5 font-medium hover:bg-amber-500/20"
          >
            Clean X
          </button>
        </div>
      )}

      {/* Side-by-Side Panels */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* LEFT — Input Features (X) */}
        <Card className="border-border/70 shadow-sm flex flex-col">
          <CardHeader className="pb-2 pt-4 px-4 border-b border-border/40">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="h-4 w-4 text-indigo-400" />
                Input Features (X)
              </CardTitle>
              <Badge variant="secondary" className="text-[10px] font-mono">
                {features.length} selected
              </Badge>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 text-[11px]">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onChange({ features: visible.map((c) => c.name).filter((n) => n !== target) })
                  }
                  className="rounded-md border border-border px-2 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground font-medium"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ features: [] })}
                  className="rounded-md border border-border px-2 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground font-medium"
                >
                  Clear All
                </button>
              </div>
              <button
                type="button"
                onClick={() => onChange({ features: recommended })}
                className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-primary transition-colors hover:bg-primary/20 font-medium"
              >
                <Sparkles className="h-3 w-3" />
                Recommended ({recommended.length})
              </button>
            </div>
          </CardHeader>
          <CardContent className="max-h-72 flex-1 space-y-1 overflow-y-auto p-2">
            {visible.map((c) => {
              const isTarget = c.name === target;
              const checked = features.includes(c.name);
              const isRecommended = recommended.includes(c.name);
              return (
                <button
                  key={c.name}
                  type="button"
                  disabled={isTarget}
                  onClick={() => toggleFeature(c.name)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors border",
                    isTarget
                      ? "cursor-not-allowed opacity-40 bg-muted/30 border-transparent"
                      : checked
                        ? "bg-primary/10 border-primary/30 text-foreground font-medium"
                        : "border-transparent text-muted-foreground hover:bg-accent hover:border-border/50",
                  )}
                >
                  {checked ? (
                    <CheckSquare className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <Square className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  )}
                  <span className="truncate font-mono">{c.name}</span>
                  <Badge variant="outline" className="ml-auto shrink-0 text-[9px] font-sans">
                    {typeBadge(c.semantic_type)}
                  </Badge>
                  {isTarget && (
                    <Badge variant="secondary" className="shrink-0 text-[9px] bg-amber-500/10 text-amber-500 border-amber-500/20">
                      Target (Y)
                    </Badge>
                  )}
                  {!isTarget && isRecommended && (
                    <span title="Recommended input feature">
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    </span>
                  )}
                </button>
              );
            })}
            {visible.length === 0 && (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No columns match the current filter or search query.
              </div>
            )}
          </CardContent>
        </Card>

        {/* RIGHT — Target Variable (Y) */}
        <Card className="border-border/70 shadow-sm flex flex-col">
          <CardHeader className="pb-2 pt-4 px-4 border-b border-border/40">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Crosshair className="h-4 w-4 text-emerald-400" />
                Target Variable (Y)
              </CardTitle>
              {target ? (
                <Badge variant="secondary" className="font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  {target}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                  Required
                </Badge>
              )}
            </div>
            <p className="pt-1 text-[11px] text-muted-foreground">
              Select exactly one target column to predict. Automatically disabled in X.
            </p>
          </CardHeader>
          <CardContent className="max-h-72 flex-1 space-y-1 overflow-y-auto p-2">
            {visible.map((c) => {
              const selected = c.name === target;
              const suggestion = suggestionFor(c.name);
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => pickTarget(c.name)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors border",
                    selected
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-medium"
                      : "border-transparent text-muted-foreground hover:bg-accent hover:border-border/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all",
                      selected ? "border-emerald-500 bg-emerald-500/20" : "border-muted-foreground/50",
                    )}
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                  </span>
                  <span className="truncate font-mono">{c.name}</span>
                  <Badge variant="outline" className="ml-auto shrink-0 text-[9px] font-sans">
                    {typeBadge(c.semantic_type)}
                  </Badge>
                  {suggestion && (
                    <Badge variant="secondary" className="shrink-0 text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                      {suggestion.type} · {Math.round(suggestion.confidence * 100)}%
                    </Badge>
                  )}
                </button>
              );
            })}
            {visible.length === 0 && (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No columns match the current filter or search query.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
