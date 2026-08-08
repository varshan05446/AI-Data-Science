"use client";

/**
 * Advanced-mode configuration panel for the Model Studio. Exposes every
 * training knob the backend understands: an X/Y feature-target picker, task,
 * algorithm subset, test split, CV folds, optimization budget and random
 * seed. Beginner mode never renders this panel.
 */
import { Settings2 } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { ModelConfig } from "@/lib/types";
import { cn } from "@/lib/utils";

import { FeatureTargetPanel } from "./feature-target-panel";
import type { TaskChoice } from "./objective-cards";

export interface AdvancedSettings {
  target: string;
  task: TaskChoice;
  algorithms: string[]; // model keys; empty = all available
  testSize: number; // fraction, 0.1–0.4
  cvFolds: number;
  tune: boolean;
  nTrials: number;
  randomState: string; // raw input; "" = None
  features: string[]; // explicit subset; empty = all
}

export const DEFAULT_ADVANCED: AdvancedSettings = {
  target: "",
  task: "auto",
  algorithms: [],
  testSize: 0.2,
  cvFolds: 3,
  tune: true,
  nTrials: 20,
  randomState: "",
  features: [],
};

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function AdvancedPanel({
  config,
  settings,
  onChange,
}: {
  config: ModelConfig;
  settings: AdvancedSettings;
  onChange: (patch: Partial<AdvancedSettings>) => void;
}) {
  const suggested = config.target_suggestions.find((s) => s.column === settings.target);
  const taskKey = settings.task === "auto" ? suggested?.type ?? null : settings.task;
  const modelChoices = taskKey ? config.models[taskKey] ?? [] : [];
  const featureChoices = config.columns.filter((c) => c.name !== settings.target);
  const supervised = settings.task !== "clustering" && settings.task !== "timeseries";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Settings2 className="h-4 w-4 text-primary" />
          Advanced configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* X / Y selection replaces the old target dropdown + feature chips. */}
        {settings.task !== "clustering" && (
          <FeatureTargetPanel
            config={config}
            target={settings.target}
            features={settings.features}
            onChange={(patch) => onChange(patch)}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="adv-task">Task</Label>
            <select
              id="adv-task"
              value={settings.task}
              onChange={(e) => onChange({ task: e.target.value as TaskChoice, algorithms: [] })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="auto">Auto-detect</option>
              <option value="classification">Classification</option>
              <option value="regression">Regression</option>
              <option value="clustering">Clustering</option>
              <option value="timeseries">Time series</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adv-split">
              Test split · <span className="font-mono">{Math.round(settings.testSize * 100)}%</span>
            </Label>
            <input
              id="adv-split"
              type="range"
              min={10}
              max={40}
              step={5}
              value={Math.round(settings.testSize * 100)}
              onChange={(e) => onChange({ testSize: Number(e.target.value) / 100 })}
              className="h-9 w-full accent-[hsl(var(--primary))]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adv-seed">Random seed</Label>
            <input
              id="adv-seed"
              type="number"
              placeholder="42 (default)"
              value={settings.randomState}
              onChange={(e) => onChange({ randomState: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {supervised && (
          <div className="flex flex-wrap items-center gap-4 border-t pt-3 text-sm">
            <div className="flex items-center gap-2">
              <Label htmlFor="adv-cv" className="text-xs">
                CV folds
              </Label>
              <input
                id="adv-cv"
                type="number"
                min={2}
                max={10}
                value={settings.cvFolds}
                onChange={(e) =>
                  onChange({ cvFolds: Math.max(2, Math.min(10, Number(e.target.value) || 3)) })
                }
                className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => onChange({ tune: !settings.tune })}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors",
                settings.tune ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
              )}
            >
              Hyperparameter optimization
              <span
                className={cn(
                  "ml-1 h-4 w-8 rounded-full transition-colors",
                  settings.tune ? "bg-primary" : "bg-muted-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "block h-4 w-4 rounded-full bg-white shadow transition-transform",
                    settings.tune && "translate-x-4",
                  )}
                />
              </span>
            </button>

            {settings.tune && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Label htmlFor="adv-trials" className="text-xs">
                  Trials
                </Label>
                <input
                  id="adv-trials"
                  type="number"
                  min={5}
                  max={100}
                  value={settings.nTrials}
                  onChange={(e) =>
                    onChange({ nTrials: Math.max(5, Math.min(100, Number(e.target.value) || 20)) })
                  }
                  className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm"
                />
                <span>Optuna search budget per model.</span>
              </div>
            )}
          </div>
        )}

        {modelChoices.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Algorithms</Label>
              <span className="text-[10px] text-muted-foreground">
                {settings.algorithms.length === 0
                  ? "All algorithms compete when none are selected."
                  : `${settings.algorithms.length} selected`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {modelChoices.map((m) => {
                const active = settings.algorithms.includes(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => onChange({ algorithms: toggle(settings.algorithms, m.key) })}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {supervised && featureChoices.length === 0 && (
          <div className="border-t pt-3 text-xs text-muted-foreground">
            No candidate input columns besides the target.
          </div>
        )}

        {suggested && (
          <Badge variant="secondary" className="text-[10px]">
            Suggested: {suggested.type} ({Math.round(suggested.confidence * 100)}% confidence)
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
