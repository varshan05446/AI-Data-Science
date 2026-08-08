"use client";

/**
 * Step 2 of the Model Studio workflow: AI-recommended business prediction
 * objectives rendered as large selectable cards ("Predict Customer Churn"),
 * plus a "Custom objective" card that lets power users point the AutoML
 * engine at any column / task combination.
 */
import { Crosshair, Sparkles } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { ModelColumnInfo, PredictionObjective } from "@/lib/types";
import { cn } from "@/lib/utils";

export type TaskChoice = "auto" | "classification" | "regression" | "clustering" | "timeseries";

const DIFFICULTY_STYLES: Record<PredictionObjective["difficulty"], string> = {
  easy: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  hard: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
};

const VALUE_LABELS: Record<PredictionObjective["business_value"], string> = {
  high: "High business value",
  medium: "Medium business value",
  low: "Exploratory value",
};

function qualityTone(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function ObjectiveCard({
  objective,
  selected,
  onSelect,
}: {
  objective: PredictionObjective;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex h-full flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/60 hover:shadow-md",
        selected && "border-primary ring-2 ring-primary/30",
      )}
    >
      {objective.recommended && (
        <Badge className="absolute -top-2.5 right-3 gap-1 text-[10px]">
          <Sparkles className="h-3 w-3" /> Recommended
        </Badge>
      )}
      <div className="space-y-1">
        <div className="font-semibold leading-tight tracking-tight">{objective.title}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px] capitalize">
            {objective.task}
          </Badge>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
              DIFFICULTY_STYLES[objective.difficulty],
            )}
          >
            {objective.difficulty}
          </span>
          <Badge
            variant={objective.business_value === "high" ? "default" : "outline"}
            className="text-[10px]"
          >
            {VALUE_LABELS[objective.business_value]}
          </Badge>
        </div>
      </div>
      <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{objective.why}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Data quality for this objective</span>
          <span className="font-mono font-medium text-foreground">{objective.data_quality}/100</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", qualityTone(objective.data_quality))}
            style={{ width: `${Math.max(4, Math.min(100, objective.data_quality))}%` }}
          />
        </div>
      </div>
    </button>
  );
}

export function ObjectiveCards({
  objectives,
  columns,
  selectedId,
  customTarget,
  onSelect,
  onSelectCustom,
}: {
  objectives: PredictionObjective[];
  columns: ModelColumnInfo[];
  selectedId: string | null;
  customTarget: string | null;
  onSelect: (objective: PredictionObjective) => void;
  onSelectCustom: (target: string, task: TaskChoice) => void;
}) {
  const [draftTarget, setDraftTarget] = React.useState<string>(columns[0]?.name ?? "");
  const [draftTask, setDraftTask] = React.useState<TaskChoice>("auto");

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {objectives.map((objective) => (
        <ObjectiveCard
          key={objective.id}
          objective={objective}
          selected={objective.id === selectedId}
          onSelect={() => onSelect(objective)}
        />
      ))}

      {/* Custom objective card — maps to the classic target/task selects. */}
      <Card
        className={cn(
          "flex h-full flex-col border-dashed",
          customTarget && "border-primary ring-2 ring-primary/30",
        )}
      >
        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Crosshair className="h-4 w-4 text-primary" />
            Custom objective
          </div>
          <p className="text-xs text-muted-foreground">
            Predict any column in the dataset, or run clustering / time-series analysis.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="custom-target" className="text-xs">
              Column to predict
            </Label>
            <select
              id="custom-target"
              value={draftTarget}
              onChange={(e) => setDraftTarget(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.semantic_type})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custom-task" className="text-xs">
              Task
            </Label>
            <select
              id="custom-task"
              value={draftTask}
              onChange={(e) => setDraftTask(e.target.value as TaskChoice)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="auto">Auto-detect</option>
              <option value="classification">Classification</option>
              <option value="regression">Regression</option>
              <option value="clustering">Clustering</option>
              <option value="timeseries">Time series</option>
            </select>
          </div>
          <Button
            variant={customTarget ? "default" : "outline"}
            size="sm"
            className="mt-auto"
            onClick={() => onSelectCustom(draftTarget, draftTask)}
          >
            Use this objective
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
