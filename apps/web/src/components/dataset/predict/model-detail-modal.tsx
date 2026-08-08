"use client";

import * as React from "react";
import {
  X,
  Sliders,
  BarChart2,
  TrendingUp,
  Activity,
  Layers,
  Sparkles,
  Zap,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ModelDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: any;
  result: any;
  onRetrain: (modelKey: string, params: Record<string, any>) => void;
}

export function ModelDetailModal({
  open,
  onOpenChange,
  entry,
  result,
  onRetrain,
}: ModelDetailModalProps) {
  if (!entry || !result) return null;

  const best = result?.best ?? {};
  const isBest = entry.key === best.key;
  const target = result.target;
  const task = result.task;

  const [tweakParams, setTweakParams] = React.useState<Record<string, any>>(
    entry.best_params ?? best.best_params ?? {}
  );

  React.useEffect(() => {
    setTweakParams(entry.best_params ?? best.best_params ?? {});
  }, [entry, best]);

  const stripPrefix = (k: string) => k.replace(/^model__/, "");

  // Normalise every param source to unprefixed keys so the comparison table
  // never shows duplicates (best.params uses plain keys, best_params uses
  // model__-prefixed keys). The backend re-prefixes them on retrain.
  const origParams = React.useMemo(() => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(best.params ?? {})) out[stripPrefix(k)] = v;
    return out;
  }, [best]);
  const tunedParams = React.useMemo(() => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(entry.best_params ?? {})) out[stripPrefix(k)] = v;
    return out;
  }, [entry]);
  const tweakState = React.useMemo(() => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(tweakParams ?? {})) out[stripPrefix(k)] = v;
    return out;
  }, [tweakParams]);

  function handleParamChange(key: string, value: string) {
    const trimmed = value.trim();
    let parsed: any = value;
    if (trimmed.toLowerCase() === "none" || trimmed.toLowerCase() === "null") {
      parsed = "None"; // backend maps "None"/"null" back to null
    } else if (!isNaN(Number(value)) && trimmed !== "") {
      parsed = Number(value);
    }
    setTweakParams((prev) => ({ ...prev, [key]: parsed }));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${entry.label} — Detailed Analysis & Tuning`}
      description={`Inspect grid search optimization history, cross-validation stability, confusion matrix / ROC curves, and manually tweak hyperparameters.`}
      className="max-w-4xl max-h-[90vh] overflow-y-auto"
    >
      <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-1 text-xs">
        {/* Top Overview Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-card border rounded-lg">
            <div className="text-muted-foreground text-[10px]">Rank</div>
            <div className="font-mono font-bold text-base text-primary">#{entry.rank}</div>
          </div>
          <div className="p-3 bg-card border rounded-lg">
            <div className="text-muted-foreground text-[10px]">Primary Metric ({result.primary_metric})</div>
            <div className="font-mono font-bold text-base text-foreground">
              {entry.metrics?.[result.primary_metric]?.toFixed(4) ?? "—"}
            </div>
          </div>
          <div className="p-3 bg-card border rounded-lg">
            <div className="text-muted-foreground text-[10px]">CV Stability</div>
            <div className="font-mono font-bold text-base text-muted-foreground">
              {entry.cv_mean != null ? `${entry.cv_mean.toFixed(3)} ± ${entry.cv_std?.toFixed(3)}` : "—"}
            </div>
          </div>
          <div className="p-3 bg-card border rounded-lg">
            <div className="text-muted-foreground text-[10px]">Training Latency</div>
            <div className="font-mono font-bold text-base text-muted-foreground">
              {entry.train_seconds ? `${entry.train_seconds.toFixed(2)}s` : "—"}
            </div>
          </div>
        </div>

        {/* Hyperparameter Comparison & Tweak Section */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2 pt-3 px-4 border-b border-border/40">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" />
                Hyperparameter Comparison & Manual Tweak
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">
                Original vs Optimized
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-3 space-y-3">
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 text-[10px] text-muted-foreground font-medium border-b">
                    <th className="py-2 px-3">Parameter</th>
                    <th className="py-2 px-3">Original / Default</th>
                    <th className="py-2 px-3">GridSearch Optimized</th>
                    <th className="py-2 px-3">Manual Tweak</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono text-[11px]">
                  {Array.from(
                    new Set([
                      ...Object.keys(origParams),
                      ...Object.keys(tunedParams),
                      ...Object.keys(tweakState),
                    ]),
                  ).map((key) => {
                    const origVal = origParams[key] ?? "default";
                    const tunedVal = tunedParams[key] ?? origVal;
                    const curVal = tweakState[key] ?? tunedVal;
                    return (
                      <tr key={key} className="hover:bg-accent/40">
                        <td className="py-1.5 px-3 font-sans font-medium text-foreground">{key}</td>
                        <td className="py-1.5 px-3 text-muted-foreground">{String(origVal)}</td>
                        <td className="py-1.5 px-3 text-emerald-400 font-bold">{String(tunedVal)}</td>
                        <td className="py-1.5 px-3">
                          <input
                            type="text"
                            value={String(curVal ?? "")}
                            onChange={(e) => handleParamChange(key, e.target.value)}
                            className="h-7 w-28 rounded border border-input bg-background px-2 text-xs font-mono"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                onClick={() => {
                  onRetrain(entry.key, tweakParams);
                  onOpenChange(false);
                }}
                className="gap-1.5 font-medium"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Retrain with Tweaked Parameters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Grid Search History & Cross Validation */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Grid Search History — real tested combinations from the tuning run */}
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-2 pt-3 px-4 border-b border-border/40">
              <CardTitle className="text-xs font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                Grid Search Optimization History
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Parameter combinations actually evaluated during optimization, best first.
              </p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {(entry.tuning_history ?? result?.tuning?.history ?? []).map((t: any, i: number) => {
                  const paramStr = Object.entries(t.params ?? {})
                    .map(([k, v]) => `${k.replace(/^model__/, "")}=${String(v)}`)
                    .join(", ");
                  return (
                    <div
                      key={`${t.score}-${i}`}
                      className="flex justify-between items-center gap-3 p-2 bg-card border rounded-md font-mono text-[11px]"
                    >
                      <span className="truncate">#{i + 1} · {paramStr || "—"}</span>
                      <span className="font-bold text-emerald-400 shrink-0">{t.score}</span>
                    </div>
                  );
                })}
                {!(entry.tuning_history ?? result?.tuning?.history ?? []).length && (
                  <p className="py-3 text-center text-[11px] text-muted-foreground">
                    No per-trial history recorded — this model was not hyperparameter-tuned.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Cross Validation Results — real per-fold scores */}
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-2 pt-3 px-4 border-b border-border/40">
              <CardTitle className="text-xs font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-400" />
                Cross-Validation Fold Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Actual per-fold {result.primary_metric} scores for this model.
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 font-mono text-center">
                {(entry.cv_folds ?? []).map((score: number, i: number) => (
                  <div key={i} className="p-2 bg-card border rounded-md">
                    <div className="text-[10px] text-muted-foreground">Fold #{i + 1}</div>
                    <div className="font-bold text-foreground text-xs pt-0.5">{score.toFixed(4)}</div>
                  </div>
                ))}
              </div>
              {!(entry.cv_folds ?? []).length && (
                <p className="py-3 text-center text-[11px] text-muted-foreground">
                  {entry.cv_mean != null
                    ? `Cross-validated score: ${entry.cv_mean.toFixed(4)} ± ${entry.cv_std?.toFixed(4) ?? "—"}`
                    : "Per-fold scores were not recorded for this model."}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Feature Importance & SHAP Summary */}
        {best.feature_importance && (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-2 pt-3 px-4 border-b border-border/40">
              <CardTitle className="text-xs font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                Feature Importance & SHAP Values Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 space-y-3">
              <div className="space-y-2">
                {best.feature_importance.slice(0, 6).map((item: any) => (
                  <div key={item.feature} className="space-y-1">
                    <div className="flex justify-between font-mono text-[11px]">
                      <span>{item.feature}</span>
                      <span className="font-bold">{(item.importance * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(4, item.importance * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Dialog>
  );
}
