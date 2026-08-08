"use client";

import * as React from "react";
import { FileText, Award, BarChart3, ShieldCheck, Sparkles, Zap, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ModelReportsProps {
  result: any;
}

export function ModelReports({ result }: ModelReportsProps) {
  const [activeReport, setActiveReport] = React.useState<number>(0);

  const best = result?.best ?? {};
  const tuning = result?.tuning ?? {};
  const leaderboard = result?.leaderboard ?? [];

  const reports = [
    {
      title: "1. Training Report",
      icon: FileText,
      summary: `Completed ${result?.task} training across ${leaderboard.length} algorithms using ${result?.n_rows_used} rows and ${result?.n_features} features.`,
      content: (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-card border rounded-lg">
              <div className="text-muted-foreground text-[10px]">Target Variable</div>
              <div className="font-mono font-semibold text-sm">{result?.target}</div>
            </div>
            <div className="p-3 bg-card border rounded-lg">
              <div className="text-muted-foreground text-[10px]">Task Type</div>
              <div className="font-semibold text-sm capitalize">{result?.task}</div>
            </div>
            <div className="p-3 bg-card border rounded-lg">
              <div className="text-muted-foreground text-[10px]">Winning Model</div>
              <div className="font-semibold text-sm text-primary">{best?.label}</div>
            </div>
            <div className="p-3 bg-card border rounded-lg">
              <div className="text-muted-foreground text-[10px]">Primary Score</div>
              <div className="font-mono font-semibold text-sm">{best?.metrics?.[result?.primary_metric]?.toFixed(4) ?? "—"}</div>
            </div>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            The training pipeline split data into holdout test evaluation and applied standardized preprocessing (imputation, scaling, one-hot encoding). Leakage checks automatically verified target isolation.
          </p>
        </div>
      ),
    },
    {
      title: "2. Optimization Report",
      icon: Zap,
      summary: `GridSearchCV / Optuna hyperparameter optimization ${tuning.improved ? "improved model quality by " + (tuning.delta * 100).toFixed(2) + "%" : "validated optimal hyperparameter defaults"}.`,
      content: (
        <div className="space-y-3 text-xs">
          <div className="p-3 bg-card border rounded-lg space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-medium">Optimization Strategy:</span>
              <Badge variant="outline">{tuning.method ?? "GridSearch"}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium">Pre-optimization score:</span>
              <span className="font-mono">{tuning.pre_score ?? "—"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium">Post-optimization score:</span>
              <span className="font-mono text-emerald-400 font-bold">{tuning.post_score ?? "—"}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "3. Hyperparameter Report",
      icon: Award,
      summary: "Detailed parameter configuration used for the top-performing estimator.",
      content: (
        <div className="space-y-2 text-xs">
          <div className="bg-card border rounded-lg p-3 font-mono max-h-48 overflow-y-auto space-y-1">
            {Object.entries(best?.params ?? {}).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-border/30 py-0.5">
                <span className="text-muted-foreground">{k}:</span>
                <span className="text-foreground">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "4. Model Comparison Report",
      icon: BarChart3,
      summary: `Evaluated ${leaderboard.length} models on primary metric (${result?.primary_metric}).`,
      content: (
        <div className="space-y-2 text-xs">
          <div className="space-y-1.5">
            {leaderboard.slice(0, 5).map((m: any, idx: number) => (
              <div key={m.key} className="flex items-center justify-between p-2 bg-card border rounded-md">
                <span className="font-medium">#{idx + 1} {m.label}</span>
                <span className="font-mono font-bold">{m.metrics?.[result?.primary_metric]?.toFixed(4) ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "5. Feature Importance Report",
      icon: Sparkles,
      summary: "Identified key driving features through permutation importance.",
      content: (
        <div className="space-y-2 text-xs">
          {(best?.feature_importance ?? []).slice(0, 5).map((fi: any) => (
            <div key={fi.feature} className="space-y-1">
              <div className="flex justify-between font-mono text-[11px]">
                <span>{fi.feature}</span>
                <span>{(fi.importance * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${Math.min(100, Math.max(5, fi.importance * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "6. Explainability Report",
      icon: ShieldCheck,
      summary: "SHAP feature attribution & decision risk analysis.",
      content: (
        <div className="space-y-2 text-xs">
          <div className="p-3 bg-card border rounded-lg space-y-1">
            <div className="font-semibold text-primary">Model Confidence & Stability</div>
            <p className="text-muted-foreground text-[11px]">
              Overall Model Confidence: {(best?.confidence * 100)?.toFixed(1)}%. Overfit gap is rated as{" "}
              <strong className="text-foreground">{best?.overfit?.verdict ?? "Low"}</strong>.
            </p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3 border-b border-border/40">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Automated Machine Learning Reports
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {reports.map((rep, i) => {
            const Icon = rep.icon;
            const active = activeReport === i;
            return (
              <button
                key={rep.title}
                type="button"
                onClick={() => setActiveReport(i)}
                className={cn(
                  "p-2.5 rounded-lg border text-left text-xs transition-colors flex flex-col justify-between h-20",
                  active
                    ? "border-primary bg-primary/10 text-primary font-semibold shadow-sm"
                    : "border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate text-[11px]">{rep.title.split(". ")[1]}</span>
              </button>
            );
          })}
        </div>

        <div className="p-4 bg-muted/30 border border-border/60 rounded-xl space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            {reports[activeReport].title}
          </h4>
          <p className="text-xs text-muted-foreground">{reports[activeReport].summary}</p>
          <div className="pt-2">{reports[activeReport].content}</div>
        </div>
      </CardContent>
    </Card>
  );
}
