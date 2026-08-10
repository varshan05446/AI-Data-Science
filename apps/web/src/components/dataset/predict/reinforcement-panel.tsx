"use client";

/**
 * Reinforcement Learning panel for the Manual Workflow. Two framings ship under
 * one task: tabular policy/value iteration and Q-learning (data as episodes),
 * plus contextual bandits (LinUCB, epsilon-greedy) with a ridge-regression
 * reward model. Requires a discrete target column to act as the action space.
 */
import * as React from "react";
import { Gamepad2, Settings2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ModelConfig } from "@/lib/types";

interface ReinforcementPanelProps {
  config: ModelConfig;
  target: string;
  features: string[];
  onTrain: (payload: Record<string, unknown>) => void;
  isPending: boolean;
}

export function ReinforcementPanel({
  config,
  target,
  features,
  onTrain,
  isPending,
}: ReinforcementPanelProps) {
  const models = React.useMemo(() => config.models["reinforcement"] ?? [], [config]);
  const [selected, setSelected] = React.useState<string | null>(models[0]?.key ?? null);
  const [gamma, setGamma] = React.useState(0.9);
  const [alpha, setAlpha] = React.useState(0.1);
  const [nBins, setNBins] = React.useState(5);
  const [maxIterations, setMaxIterations] = React.useState(100);

  React.useEffect(() => {
    if (!selected && models.length > 0) setSelected(models[0].key);
  }, [models, selected]);

  const needsTarget = !target;

  function handleTrain() {
    onTrain({
      task: "reinforcement",
      model_keys: selected ? [selected] : null,
      gamma,
      alpha,
      n_bins: nBins,
      max_iterations: maxIterations,
      target,
      features: features.length ? features : null,
    });
  }

  return (
    <div className="space-y-5">
      {needsTarget && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs">
          <Gamepad2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Pick a discrete target column in Step 1.</span>{" "}
            Its values become the action space; the learned policy is scored by holdout accuracy.
          </p>
        </div>
      )}

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Gamepad2 className="h-4 w-4 text-rose-400" />
            Select Reinforcement Algorithm
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reinforcement algorithms are available for this dataset.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {models.map((m) => {
                const active = selected === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setSelected(m.key)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-medium transition-all text-left",
                      active
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Settings2 className="h-4 w-4 text-primary" />
            Reinforcement Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4 text-xs">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Discount factor γ</Label>
                <Badge variant="outline" className="text-[10px] font-mono">{gamma.toFixed(2)}</Badge>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.99}
                step={0.01}
                value={gamma}
                onChange={(e) => setGamma(Number(e.target.value))}
                className="h-8 w-full accent-primary"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Learning rate α (Q-learning)</Label>
                <Badge variant="outline" className="text-[10px] font-mono">{alpha.toFixed(2)}</Badge>
              </div>
              <input
                type="range"
                min={0.01}
                max={1}
                step={0.01}
                value={alpha}
                onChange={(e) => setAlpha(Number(e.target.value))}
                className="h-8 w-full accent-primary"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">State bins per numeric feature</Label>
                <Badge variant="outline" className="text-[10px] font-mono">{nBins}</Badge>
              </div>
              <input
                type="range"
                min={2}
                max={10}
                step={1}
                value={nBins}
                onChange={(e) => setNBins(Number(e.target.value))}
                className="h-8 w-full accent-primary"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Max iterations / episodes</Label>
              <input
                type="number"
                min={10}
                max={2000}
                step={10}
                value={maxIterations}
                onChange={(e) => setMaxIterations(Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-2">
            {target ? (
              <>
                Action space: <span className="font-mono text-foreground">{target}</span> · uses{" "}
                {features.length ? `${features.length} input feature(s)` : "all columns"} from Step 1.
              </>
            ) : (
              "Choose the discrete target column in Step 1 to continue."
            )}
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-2">
        <Button
          size="lg"
          onClick={handleTrain}
          disabled={isPending || needsTarget}
          className="gap-2 font-medium shadow-md"
        >
          <Sparkles className="h-4 w-4" />
          {isPending ? "Training Reinforcement…" : "Train Reinforcement Model"}
        </Button>
      </div>
    </div>
  );
}
