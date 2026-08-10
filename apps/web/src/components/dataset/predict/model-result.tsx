"use client";

/**
 * Renders a completed AutoML / Model Studio run: the winning model, tuning
 * delta, the AI advisor summary, a metric grid, a headline diagnostic preview
 * and the full ranked leaderboard. Clicking any model row opens a detail drawer
 * with every diagnostic the backend computed for that run's winner.
 */
import { ArrowUpRight, ShieldAlert, Sparkles, TrendingUp, Trophy } from "lucide-react";
import * as React from "react";

import { PlotlyChart } from "@/components/charts/plotly-chart";
import { ModelDetailDrawer } from "@/components/dataset/predict/model-detail";
import {
  clusterChart,
  convergenceChart,
  elbowChart,
  forecastChart,
  importanceChart,
  pseudoLabelChart,
} from "@/components/dataset/predict/model-diagnostics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LeaderboardEntry, ModelBest, ModelResult } from "@/lib/types";
import { ResizablePanels } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

const METRIC_LABELS: Record<string, string> = {
  accuracy: "Accuracy",
  f1_weighted: "F1 (weighted)",
  precision_weighted: "Precision",
  recall_weighted: "Recall",
  roc_auc: "ROC AUC",
  r2: "R²",
  rmse: "RMSE",
  mae: "MAE",
  silhouette: "Silhouette",
  n_clusters: "Clusters",
  policy_accuracy: "Policy Accuracy",
  avg_reward: "Avg Reward",
  iterations: "Iterations",
  labeled: "Labeled",
  unlabeled: "Unlabeled",
};

function fmtMetric(key: string, value: number): string {
  if (["rmse", "mae", "n_clusters", "iterations", "labeled", "unlabeled"].includes(key)) {
    return value.toLocaleString();
  }
  return value.toFixed(3);
}

/** Compact SVG ring visualizing the winner's 0–1 confidence score. */
function ConfidenceRing({ value }: { value: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  const tone = pct >= 0.75 ? "text-emerald-500" : pct >= 0.5 ? "text-amber-500" : "text-red-500";
  return (
    <div className="relative h-12 w-12">
      <svg viewBox="0 0 40 40" className="h-12 w-12 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${pct * c} ${c}`}
          className={cn("stroke-current transition-all", tone)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-semibold">
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

function MetricCard({ metricKey, value, primary }: { metricKey: string; value: number; primary: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", primary ? "border-primary bg-primary/5" : "bg-muted/30")}>
      <div className="text-xs text-muted-foreground">{METRIC_LABELS[metricKey] ?? metricKey}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{fmtMetric(metricKey, value)}</div>
    </div>
  );
}

/** Build a lightweight ModelBest for a non-winning leaderboard row. */
function entryToBest(entry: LeaderboardEntry): ModelBest {
  return {
    key: entry.key,
    label: entry.label,
    metrics: entry.metrics ?? {},
    feature_importance: [],
    tuned: entry.tuned,
    best_params: entry.best_params,
  };
}

export function ModelResultView({ result }: { result: ModelResult }) {
  const { best, leaderboard, primary_metric, tuning, advisor, task } = result;
  const [detail, setDetail] = React.useState<ModelBest | null>(null);

  const metricKeys = Object.keys(best.metrics);
  // Banner wording: only target-less tasks skip the "predicting {target}" form.
  const targetless = task === "clustering" || task === "timeseries" || task === "reinforcement";
  const bestEntry = leaderboard.find((e) => e.key === best.key);
  const leakageRemoved = result.leakage?.removed ?? [];

  // Headline diagnostic preview beside feature importance.
  const previewChart = React.useMemo(() => {
    if (task === "clustering") {
      if (best.elbow) return elbowChart(best.elbow, best.key);
      if (best.cluster_plot) return clusterChart(best.cluster_plot, best.key);
    }
    if (task === "reinforcement" && best.convergence) return convergenceChart(best.convergence, best.key);
    if (task === "semi_supervised" && best.pseudo_labels?.labels?.length)
      return pseudoLabelChart(best.pseudo_labels, best.key);
    if (task === "timeseries" && best.forecast) return forecastChart(best.forecast, best.key);
    return null;
  }, [task, best]);

  return (
    <div className="space-y-6">
      {/* Winner banner */}
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <div className="rounded-full bg-primary/15 p-2 text-primary">
            <Trophy className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {targetless ? "Best model" : "Best model for predicting"}{" "}
              {!targetless && <span className="font-medium text-foreground">{result.target}</span>}
              <Badge variant="secondary" className="text-[10px]">
                {task}
              </Badge>
              {best.tuned && <Badge className="text-[10px]">tuned</Badge>}
            </div>
            <div className="text-xl font-semibold tracking-tight">{best.label}</div>
          </div>
          {best.confidence != null && (
            <div className="flex items-center gap-2">
              <ConfidenceRing value={best.confidence} />
              <div className="text-xs text-muted-foreground">
                Confidence
                {bestEntry?.train_seconds != null && (
                  <div className="font-mono text-[11px]">{bestEntry.train_seconds}s train</div>
                )}
              </div>
            </div>
          )}
          <div className="text-right">
            <div className="text-xs uppercase text-muted-foreground">
              {METRIC_LABELS[primary_metric] ?? primary_metric}
            </div>
            <div className="font-mono text-2xl font-bold text-primary">
              {fmtMetric(primary_metric, best.metrics[primary_metric] ?? 0)}
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setDetail(best)}>
            View diagnostics <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>

      {/* Task-specific setup strip */}
      {(task === "semi_supervised" || task === "reinforcement") && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          {task === "semi_supervised" && best.labeled != null && (
            <>
              <span>
                <span className="font-medium text-foreground">{best.labeled.toLocaleString()}</span>{" "}
                labeled · <span className="font-medium text-foreground">{best.unlabeled?.toLocaleString()}</span>{" "}
                unlabeled rows
              </span>
              {best.threshold != null && (
                <Badge variant="outline" className="text-[10px]">pseudo-label threshold {best.threshold}</Badge>
              )}
            </>
          )}
          {task === "reinforcement" && (
            <>
              <span>
                Discrete state space:{" "}
                <span className="font-medium text-foreground">
                  {String(best.params?.n_states ?? "—")} states
                </span>{" "}
                × <span className="font-medium text-foreground">{String(best.params?.n_actions ?? "—")} actions</span>
              </span>
              {best.avg_reward != null && (
                <Badge variant="outline" className="text-[10px]">avg reward {best.avg_reward.toFixed(3)}</Badge>
              )}
            </>
          )}
        </div>
      )}

      {/* Leakage protection notice */}
      {leakageRemoved.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <span className="font-medium">Leakage protection:</span>{" "}
            <span className="text-muted-foreground">
              {leakageRemoved.length === 1 ? "1 column was" : `${leakageRemoved.length} columns were`}{" "}
              excluded because they would reveal the answer to the model —{" "}
              {leakageRemoved.map((r, i) => (
                <React.Fragment key={r.feature}>
                  {i > 0 && ", "}
                  <span className="font-mono text-foreground">{r.feature}</span> ({r.reason})
                </React.Fragment>
              ))}
              .
            </span>
          </div>
        </div>
      )}

      {/* Tuning delta */}
      {tuning?.enabled && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="font-medium">Hyperparameter tuning</span>
          <Badge variant="outline" className="text-[10px]">{tuning.method}</Badge>
          <span className="text-muted-foreground">
            {tuning.n_trials} trials over {tuning.models_tuned?.length ?? 0} models
          </span>
          {tuning.delta != null && (
            <Badge variant={tuning.improved ? "default" : "secondary"} className="ml-auto">
              {tuning.delta >= 0 ? "+" : ""}
              {tuning.delta.toFixed(4)} {METRIC_LABELS[primary_metric] ?? primary_metric}
            </Badge>
          )}
        </div>
      )}

      {/* AI advisor summary */}
      {advisor && (
        <Card className="border-primary/30">
          <CardContent className="space-y-2 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" /> AI Explanation
            </div>
            {advisor.business_summary && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {advisor.business_summary}
              </p>
            )}
            <p className="text-sm text-muted-foreground">{advisor.summary}</p>
            {advisor.suggestions.length > 0 && (
              <ul className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                {advisor.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-primary">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {metricKeys.map((k) => (
          <MetricCard key={k} metricKey={k} value={best.metrics[k]} primary={k === primary_metric} />
        ))}
      </div>

      {(() => {
        const importanceCard = best.feature_importance.length ? (
          <Card className="flex h-full flex-col">
            <CardHeader>
              <CardTitle className="text-sm">Feature importance</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <PlotlyChart
                chart={importanceChart(best.feature_importance, best.key, "Feature importance")}
                height={Math.max(240, best.feature_importance.length * 26)}
              />
            </CardContent>
          </Card>
        ) : null;

        const previewCard = previewChart ? (
          <Card className="flex h-full flex-col">
            <CardHeader>
              <CardTitle className="text-sm">{previewChart.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <PlotlyChart chart={previewChart} height={300} />
            </CardContent>
          </Card>
        ) : null;

        // Two panes present → resizable split; otherwise render whichever exists.
        if (importanceCard && previewCard) {
          return (
            <ResizablePanels
              storageKey="model-diagnostics-split"
              defaultLeft={50}
              min={30}
              max={70}
              left={importanceCard}
              right={previewCard}
            />
          );
        }
        return importanceCard ?? previewCard;
      })()}

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Leaderboard · {result.n_rows_used.toLocaleString()} rows · {result.n_features} features
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">{METRIC_LABELS[primary_metric] ?? primary_metric}</TableHead>
                <TableHead className="text-right">CV stability</TableHead>
                <TableHead className="text-right">Time (s)</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.map((entry) => {
                const disabled = Boolean(entry.error);
                return (
                  <TableRow
                    key={entry.key}
                    onClick={() =>
                      !disabled && setDetail(entry.key === best.key ? best : entryToBest(entry))
                    }
                    className={cn(
                      entry.rank === 1 && "bg-primary/5",
                      !disabled && "cursor-pointer hover:bg-accent",
                    )}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {entry.rank ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {entry.label}
                      {entry.tuned && (
                        <Badge variant="outline" className="ml-2 text-[10px]">tuned</Badge>
                      )}
                      {entry.error && <span className="ml-2 text-xs text-destructive">failed</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {entry.metrics?.[primary_metric] !== undefined
                        ? fmtMetric(primary_metric, entry.metrics[primary_metric])
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {entry.cv_mean != null
                        ? `${entry.cv_mean.toFixed(3)} ± ${(entry.cv_std ?? 0).toFixed(3)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {entry.train_seconds ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {!disabled && <ArrowUpRight className="h-3.5 w-3.5" />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {detail && (
        <ModelDetailDrawer
          best={detail}
          task={task}
          advisor={detail.key === best.key ? advisor : undefined}
          open={!!detail}
          onOpenChange={(o) => !o && setDetail(null)}
        />
      )}
    </div>
  );
}
