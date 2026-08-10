"use client";

/**
 * Full-screen detail drawer (modal) for a single model. Shows every diagnostic
 * the backend produced — ROC, confusion matrix, residuals, learning curve,
 * prediction distribution, tuned hyper-parameters and SHAP importance — plus
 * the AI advisor's plain-language explanation.
 */
import { Sparkles } from "lucide-react";
import * as React from "react";

import {
  actionCountChart,
  clusterChart,
  convergenceChart,
  elbowChart,
  forecastChart,
  importanceChart,
  learningCurveChart,
  predictionDistChart,
  pseudoLabelChart,
  residualChart,
  rocChart,
  valueHistogramChart,
} from "@/components/dataset/predict/model-diagnostics";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import type { ModelAdvice, ModelBest, MlTask } from "@/lib/types";
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 text-sm font-medium">{title}</div>
      {children}
    </div>
  );
}

function ConfusionMatrixView({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  const max = Math.max(1, ...matrix.flat());
  return (
    <div className="overflow-auto scrollbar-thin">
      <table className="border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="p-1 text-muted-foreground">actual \ pred</th>
            {labels.map((l) => (
              <th key={l} className="p-1 font-medium text-muted-foreground">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={labels[i]}>
              <td className="pr-2 text-right font-medium text-muted-foreground">{labels[i]}</td>
              {row.map((v, j) => (
                <td
                  key={`${i}-${j}`}
                  className="h-9 w-9 rounded text-center font-medium"
                  style={{
                    backgroundColor: `hsl(243 75% 59% / ${0.1 + (v / max) * 0.8})`,
                    color: v / max > 0.5 ? "white" : undefined,
                  }}
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ParamsTable({ params }: { params: Record<string, unknown> }) {
  const entries = Object.entries(params);
  if (!entries.length) {
    return <p className="text-sm text-muted-foreground">No tunable parameters reported.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-2 border-b border-dashed py-1">
          <span className="truncate text-muted-foreground" title={k}>
            {k.replace(/^model__/, "")}
          </span>
          <span className="font-mono">{String(v)}</span>
        </div>
      ))}
    </div>
  );
}

/** PCA explained-variance ratios shown as labelled horizontal bars. */
function ExplainedVarianceView({ ratios }: { ratios: number[] }) {
  const max = Math.max(1e-9, ...ratios);
  const cumulative = ratios.reduce<number[]>((acc, r, i) => {
    acc.push((acc[i - 1] ?? 0) + r);
    return acc;
  }, []);
  return (
    <div className="space-y-1.5 text-xs">
      {ratios.map((r, i) => (
        <div key={i}>
          <div className="mb-0.5 flex justify-between text-muted-foreground">
            <span className="font-mono">PC{i + 1}</span>
            <span>
              {(r * 100).toFixed(1)}% · cum {(cumulative[i] * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary/70"
              style={{ width: `${(r / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function verdictTone(verdict?: string): string {
  if (verdict === "high") return "text-destructive";
  if (verdict === "moderate") return "text-amber-500";
  return "text-emerald-500";
}

export function ModelDetailDrawer({
  best,
  task,
  advisor,
  open,
  onOpenChange,
}: {
  best: ModelBest;
  task: MlTask;
  advisor?: ModelAdvice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = best.key;
  const params = best.best_params && Object.keys(best.best_params).length ? best.best_params : best.params;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={best.label}
      description="Model diagnostics & AI explanation"
      className="max-w-5xl max-h-[88vh] overflow-y-auto scrollbar-thin"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {best.tuned && <Badge variant="secondary">Hyper-tuned</Badge>}
          {best.confidence != null && (
            <Badge variant="outline" className="text-primary">
              Confidence {Math.round(best.confidence * 100)}%
            </Badge>
          )}
          {best.overfit && (
            <Badge variant="outline" className={cn("gap-1", verdictTone(best.overfit.verdict))}>
              Overfit: {best.overfit.verdict} (gap {best.overfit.gap.toFixed(3)})
            </Badge>
          )}
          {best.n_clusters != null && <Badge variant="outline">{best.n_clusters} clusters</Badge>}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(best.metrics).map(([k, v]) => (
            <div key={k} className="rounded-lg border bg-muted/30 p-2.5">
              <div className="text-[11px] text-muted-foreground">{METRIC_LABELS[k] ?? k}</div>
              <div className="mt-0.5 font-mono text-base font-semibold">{fmtMetric(k, v)}</div>
            </div>
          ))}
        </div>

        {advisor && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" /> AI explanation
            </div>
            <p className="text-sm text-muted-foreground">{advisor.winner_reason}</p>
            {advisor.suggestions.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {advisor.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {task === "classification" && best.roc_curve && best.roc_curve.fpr.length > 1 && (
            <Panel title={`ROC curve${best.roc_curve.auc != null ? ` · AUC ${best.roc_curve.auc.toFixed(3)}` : ""}`}>
              <PlotlyChart chart={rocChart(best.roc_curve, id)} height={260} />
            </Panel>
          )}

          {task === "classification" && best.confusion_matrix && (
            <Panel title="Confusion matrix">
              <ConfusionMatrixView
                labels={best.confusion_matrix.labels}
                matrix={best.confusion_matrix.matrix}
              />
            </Panel>
          )}

          {best.learning_curve && (
            <Panel title="Learning curve">
              <PlotlyChart chart={learningCurveChart(best.learning_curve, id)} height={260} />
            </Panel>
          )}

          {best.prediction_distribution && (
            <Panel title="Prediction distribution">
              <PlotlyChart chart={predictionDistChart(best.prediction_distribution, id)} height={260} />
            </Panel>
          )}

          {task === "regression" && best.residual_series && best.residual_series.length > 0 && (
            <Panel title="Residuals">
              <PlotlyChart chart={residualChart(best.residual_series, id)} height={260} />
            </Panel>
          )}

          {task === "clustering" && best.cluster_plot && (
            <Panel title="Cluster projection">
              <PlotlyChart chart={clusterChart(best.cluster_plot, id)} height={260} />
            </Panel>
          )}

          {task === "clustering" && best.elbow && (
            <Panel title="Silhouette vs. cluster count">
              <PlotlyChart chart={elbowChart(best.elbow, id)} height={260} />
            </Panel>
          )}

          {task === "clustering" && best.explained_variance && best.explained_variance.length > 0 && (
            <Panel title="PCA explained variance">
              <ExplainedVarianceView ratios={best.explained_variance} />
            </Panel>
          )}

          {task === "timeseries" && best.forecast && (
            <Panel title="Forecast">
              <PlotlyChart chart={forecastChart(best.forecast, id)} height={260} />
            </Panel>
          )}

          {task === "semi_supervised" && best.labeled != null && (
            <Panel title="Semi-supervised setup">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[11px] text-muted-foreground">Labeled rows</div>
                  <div className="mt-0.5 font-mono text-base font-semibold">
                    {best.labeled.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Unlabeled rows</div>
                  <div className="mt-0.5 font-mono text-base font-semibold">
                    {(best.unlabeled ?? 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Pseudo-label threshold</div>
                  <div className="mt-0.5 font-mono text-base font-semibold">{best.threshold ?? "—"}</div>
                </div>
                {best.base_estimator && (
                  <div>
                    <div className="text-[11px] text-muted-foreground">Base estimator</div>
                    <div className="mt-0.5 font-mono text-base font-semibold">{best.base_estimator}</div>
                  </div>
                )}
              </div>
              {best.pseudo_labels?.count != null && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {best.pseudo_labels.count.toLocaleString()} rows pseudo-labelled from the unlabeled
                  pool (mean confidence{" "}
                  {best.pseudo_labels.mean_confidence != null
                    ? (best.pseudo_labels.mean_confidence * 100).toFixed(0) + "%"
                    : "—"}
                  ).
                </p>
              )}
            </Panel>
          )}

          {task === "semi_supervised" && best.pseudo_labels?.labels?.length && (
            <Panel title="Pseudo-labelled rows by class">
              <PlotlyChart chart={pseudoLabelChart(best.pseudo_labels, id)} height={260} />
            </Panel>
          )}

          {task === "reinforcement" && best.convergence && (
            <Panel title={`Policy convergence${best.convergence.iterations != null ? ` · ${best.convergence.iterations} iterations` : ""}`}>
              <PlotlyChart chart={convergenceChart(best.convergence, id)} height={260} />
            </Panel>
          )}

          {task === "reinforcement" && best.action_counts && best.action_counts.length > 0 && (
            <Panel title="Action selection counts">
              <PlotlyChart chart={actionCountChart(best.action_counts, id)} height={260} />
            </Panel>
          )}

          {task === "reinforcement" && best.value_histogram && best.value_histogram.length > 0 && (
            <Panel title="Learned state-values">
              <PlotlyChart chart={valueHistogramChart(best.value_histogram, id)} height={260} />
            </Panel>
          )}

          {task === "reinforcement" && best.state_samples && best.state_samples.length > 0 && (
            <Panel title="Learned policy (state → action)">
              <div className="max-h-56 overflow-y-auto scrollbar-thin">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-muted-foreground">
                      <th className="py-1 pr-3 text-left font-medium">State</th>
                      <th className="py-1 pr-3 text-left font-medium">Action</th>
                      <th className="py-1 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {best.state_samples.slice(0, 200).map((s, i) => (
                      <tr key={i} className="border-t border-dashed">
                        <td className="py-1 pr-3 font-mono">{s.state}</td>
                        <td className="py-1 pr-3 font-medium">{s.action}</td>
                        <td className="py-1 text-right font-mono">{s.value.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {best.shap && best.shap.values.length > 0 && (
            <Panel title="SHAP feature impact">
              <PlotlyChart
                chart={importanceChart(best.shap.values, `shap_${id}`, "SHAP feature impact")}
                height={Math.max(220, best.shap.values.length * 26)}
              />
            </Panel>
          )}

          {best.feature_importance.length > 0 && (
            <Panel title="Feature importance (permutation)">
              <PlotlyChart
                chart={importanceChart(best.feature_importance, id, "Feature importance")}
                height={Math.max(220, best.feature_importance.length * 26)}
              />
            </Panel>
          )}
        </div>

        {params && (
          <Panel title={best.tuned ? "Tuned hyper-parameters" : "Model parameters"}>
            <ParamsTable params={params} />
          </Panel>
        )}
      </div>
    </Dialog>
  );
}
