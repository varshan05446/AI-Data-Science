"use client";

/**
 * Semi-Supervised Learning panel for the Manual Workflow. Trains on a partially
 * labelled target column: the pipeline uses labelled rows to bootstrap
 * pseudo-labels on the unlabelled pool. Classification only.
 */
import * as React from "react";
import { BrainCircuit, Settings2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ModelConfig } from "@/lib/types";

const BASE_ESTIMATOR_LABELS: Record<string, string> = {
  logistic_regression: "Logistic Regression",
  random_forest_clf: "Random Forest",
  gradient_boosting_clf: "Gradient Boosting",
};

interface SemiSupervisedPanelProps {
  config: ModelConfig;
  target: string;
  features: string[];
  onTrain: (payload: Record<string, unknown>) => void;
  isPending: boolean;
}

export function SemiSupervisedPanel({
  config,
  target,
  features,
  onTrain,
  isPending,
}: SemiSupervisedPanelProps) {
  const models = React.useMemo(() => config.models["semi_supervised"] ?? [], [config]);
  const [selected, setSelected] = React.useState<string | null>(models[0]?.key ?? null);
  const [threshold, setThreshold] = React.useState(0.75);
  const [baseEstimator, setBaseEstimator] = React.useState("logistic_regression");

  React.useEffect(() => {
    if (!selected && models.length > 0) setSelected(models[0].key);
  }, [models, selected]);

  const usesSelfTraining = selected === "self_training";
  const needsTarget = !target;

  function handleTrain() {
    onTrain({
      task: "semi_supervised",
      model_keys: selected ? [selected] : null,
      threshold,
      base_estimator: usesSelfTraining ? baseEstimator : null,
      target,
      features: features.length ? features : null,
    });
  }

  return (
    <div className="space-y-5">
      {needsTarget && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs">
          <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Pick a partially-labelled target in Step 1.</span>{" "}
            Rows with empty target values are treated as the unlabeled pool; labelled rows drive
            training.
          </p>
        </div>
      )}

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-cyan-400" />
            Select Semi-Supervised Algorithm
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No semi-supervised algorithms are available for this dataset.
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
            Semi-Supervised Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4 text-xs">
          {usesSelfTraining && (
            <div className="space-y-1.5">
              <Label className="text-xs">Base Estimator (Self-Training)</Label>
              <select
                value={baseEstimator}
                onChange={(e) => setBaseEstimator(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                {Object.entries(BASE_ESTIMATOR_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Pseudo-label Confidence Threshold</Label>
              <Badge variant="outline" className="text-[10px] font-mono">
                {threshold.toFixed(2)}
              </Badge>
            </div>
            <input
              type="range"
              min={0.5}
              max={0.95}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="h-8 w-full accent-primary"
            />
            <p className="text-[11px] text-muted-foreground">
              Only unlabeled rows the model predicts above this confidence get pseudo-labelled and
              folded back into training.
            </p>
          </div>

          <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-2">
            {target ? (
              <>
                Target: <span className="font-mono text-foreground">{target}</span> · uses{" "}
                {features.length ? `${features.length} input feature(s)` : "all columns"} from Step 1.
              </>
            ) : (
              "Choose the partially-labelled target column in Step 1 to continue."
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
          {isPending ? "Training Semi-Supervised…" : "Train Semi-Supervised Model"}
        </Button>
      </div>
    </div>
  );
}
