"use client";

/**
 * Unsupervised Learning panel for the Manual Workflow. Runs clustering with an
 * auto-ranked cluster count (silhouette elbow), PCA projection diagnostics and
 * per-feature contribution. Target is optional for this paradigm.
 */
import * as React from "react";
import { Layers, Settings2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ModelConfig } from "@/lib/types";

interface UnsupervisedPanelProps {
  config: ModelConfig;
  features: string[];
  onTrain: (payload: Record<string, unknown>) => void;
  isPending: boolean;
}

export function UnsupervisedPanel({ config, features, onTrain, isPending }: UnsupervisedPanelProps) {
  const models = React.useMemo(() => config.models["clustering"] ?? [], [config]);
  const [selected, setSelected] = React.useState<string | null>(models[0]?.key ?? null);
  const [autoClusters, setAutoClusters] = React.useState(true);
  const [nClusters, setNClusters] = React.useState(4);
  const [scaling, setScaling] = React.useState("standard");
  const [encoding, setEncoding] = React.useState("onehot");
  const [linkage, setLinkage] = React.useState("ward");

  React.useEffect(() => {
    if (!selected && models.length > 0) setSelected(models[0].key);
  }, [models, selected]);

  function handleTrain() {
    onTrain({
      task: "clustering",
      model_keys: selected ? [selected] : null,
      n_clusters: autoClusters ? null : nClusters,
      linkage,
      features: features.length ? features : null,
      fitting: { scaling, encoding },
    });
  }

  return (
    <div className="space-y-5">
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4 text-indigo-400" />
            Select Clustering Algorithm
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No clustering algorithms are available for this dataset.
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
            Clustering Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4 text-xs">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Cluster Count</Label>
                <Badge variant={autoClusters ? "default" : "outline"} className="text-[10px]">
                  {autoClusters ? "Auto (silhouette elbow)" : `${nClusters} clusters`}
                </Badge>
              </div>
              <input
                type="range"
                min={2}
                max={15}
                step={1}
                disabled={autoClusters}
                value={nClusters}
                onChange={(e) => setNClusters(Number(e.target.value))}
                className="h-8 w-full accent-primary disabled:opacity-40"
              />
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={autoClusters}
                  onChange={(e) => setAutoClusters(e.target.checked)}
                  className="rounded border-input text-primary"
                />
                <span>Auto-rank k via silhouette score</span>
              </label>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Linkage (Agglomerative)</Label>
              <select
                value={linkage}
                onChange={(e) => setLinkage(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="ward">Ward</option>
                <option value="complete">Complete</option>
                <option value="average">Average</option>
                <option value="single">Single</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Feature Scaling</Label>
              <select
                value={scaling}
                onChange={(e) => setScaling(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="standard">StandardScaler</option>
                <option value="minmax">MinMaxScaler</option>
                <option value="robust">RobustScaler</option>
                <option value="none">None</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Categorical Encoding</Label>
              <select
                value={encoding}
                onChange={(e) => setEncoding(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="onehot">OneHotEncoder</option>
                <option value="ordinal">OrdinalEncoder</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-2">
            Uses {features.length ? `${features.length} input feature(s)` : "all columns"} from Step 1.
            No target needed — results include a PCA cluster projection, silhouette-vs-k elbow and
            per-feature contribution.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-2">
        <Button size="lg" onClick={handleTrain} disabled={isPending} className="gap-2 font-medium shadow-md">
          <Sparkles className="h-4 w-4" />
          {isPending ? "Training Clustering…" : "Train Clustering Model"}
        </Button>
      </div>
    </div>
  );
}
