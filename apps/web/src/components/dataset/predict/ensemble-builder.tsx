"use client";

import * as React from "react";
import { Layers, Plus, Trash2, Sliders, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EnsembleType = "voting" | "bagging" | "stacking" | "boosting" | "blending" | "custom";

export interface EnsembleConfig {
  type: EnsembleType;
  baseModels: string[];
  metaLearner: string;
  votingStrategy: "hard" | "soft";
  weights: Record<string, number>;
}

interface EnsembleBuilderProps {
  availableModels: { key: string; label: string }[];
  config: EnsembleConfig;
  onChange: (config: EnsembleConfig) => void;
}

export function EnsembleBuilder({
  availableModels,
  config,
  onChange,
}: EnsembleBuilderProps) {
  const [enabled, setEnabled] = React.useState(false);

  function updateType(type: EnsembleType) {
    onChange({ ...config, type });
  }

  function toggleBaseModel(key: string) {
    const exists = config.baseModels.includes(key);
    const next = exists
      ? config.baseModels.filter((k) => k !== key)
      : [...config.baseModels, key];
    onChange({ ...config, baseModels: next });
  }

  function updateWeight(key: string, weight: number) {
    onChange({
      ...config,
      weights: { ...config.weights, [key]: weight },
    });
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4 text-indigo-400" />
            Ensemble Builder
          </CardTitle>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
              enabled ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-400" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {enabled ? "Ensemble Enabled" : "Enable Ensemble Builder"}
            <span
              className={cn(
                "h-3.5 w-7 rounded-full transition-colors relative inline-block",
                enabled ? "bg-indigo-500" : "bg-muted-foreground/30"
              )}
            >
              <span
                className={cn(
                  "block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                  enabled && "translate-x-3.5"
                )}
              />
            </span>
          </button>
        </div>
      </CardHeader>

      {enabled && (
        <CardContent className="space-y-4 pt-4 text-xs">
          {/* Ensemble Type Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Ensemble Strategy</Label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {(["voting", "bagging", "stacking", "boosting", "blending", "custom"] as EnsembleType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => updateType(t)}
                  className={cn(
                    "rounded-lg border p-2 text-center text-xs capitalize transition-colors font-medium",
                    config.type === t
                      ? "border-indigo-500 bg-indigo-500/10 text-indigo-400"
                      : "border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Base Models Selection */}
          <div className="space-y-1.5 pt-2 border-t border-border/40">
            <Label className="text-xs font-medium">Select Base Estimators ({config.baseModels.length} selected)</Label>
            <div className="flex flex-wrap gap-1.5">
              {availableModels.map((m) => {
                const selected = config.baseModels.includes(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => toggleBaseModel(m.key)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      selected
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-400 font-medium"
                        : "border-border/60 text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Strategy Specific Settings */}
          {config.type === "voting" && (
            <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
              <div className="space-y-1.5">
                <Label className="text-xs">Voting Strategy</Label>
                <select
                  value={config.votingStrategy}
                  onChange={(e) => onChange({ ...config, votingStrategy: e.target.value as "hard" | "soft" })}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="soft">Soft Voting (Probability Weighted)</option>
                  <option value="hard">Hard Voting (Majority Vote)</option>
                </select>
              </div>
            </div>
          )}

          {config.type === "stacking" && (
            <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
              <div className="space-y-1.5">
                <Label className="text-xs">Meta Learner (Final Estimator)</Label>
                <select
                  value={config.metaLearner}
                  onChange={(e) => onChange({ ...config, metaLearner: e.target.value })}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="logistic_regression">Logistic Regression / Ridge</option>
                  <option value="random_forest_clf">Random Forest</option>
                  <option value="gradient_boosting_clf">Gradient Boosting</option>
                </select>
              </div>
            </div>
          )}

          {/* Model Weights */}
          {config.baseModels.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/40">
              <Label className="text-xs font-medium">Estimator Weights</Label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {config.baseModels.map((key) => {
                  const m = availableModels.find((x) => x.key === key);
                  return (
                    <div key={key} className="flex items-center gap-2 bg-accent/30 p-2 rounded-md border border-border/50">
                      <span className="font-mono truncate flex-1">{m?.label ?? key}</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="10"
                        value={config.weights[key] ?? 1.0}
                        onChange={(e) => updateWeight(key, Number(e.target.value))}
                        className="h-7 w-16 rounded border border-input bg-background px-1.5 text-center text-xs font-mono"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
