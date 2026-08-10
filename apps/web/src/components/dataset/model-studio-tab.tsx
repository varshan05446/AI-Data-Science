"use client";

/**
 * Model Studio: Professional Machine Learning Workspace.
 * Features:
 * - Workflow Selection (Manual Model Building vs Automated Model Building)
 * - Step 1: Side-by-Side Feature Selection (X & Y) with data leakage guards & datatype filters
 * - Manual Workflow: ML Categories left sidebar, hyperparameter configs, Ensemble Builder, Model Fitting
 * - Automated Workflow: GridSearch hyperparameter tuning, Ranked Leaderboard, SHAP & Diagnostics, 6 Auto Reports
 * - Background Job execution & automatic reconnection across navigation
 */
import {
  Check,
  History,
  Sparkles,
  Target,
  Wrench,
  Cpu,
  Layers,
  FileText,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import * as React from "react";
import { useSession } from "next-auth/react";

import { FeatureTargetPanel, recommendFeatures } from "@/components/dataset/predict/feature-target-panel";
import { WorkflowSelection, type WorkflowType } from "@/components/dataset/predict/workflow-selection";
import { ManualWorkflow } from "@/components/dataset/predict/manual-workflow";
import { SignalScanPanel } from "@/components/dataset/predict/signal-scan-panel";
import { AutomatedWorkflow } from "@/components/dataset/predict/automated-workflow";
import { ModelResultView } from "@/components/dataset/predict/model-result";
import { Playground } from "@/components/dataset/predict/playground";
import { TrainingProgress } from "@/components/dataset/predict/training-progress";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingLines } from "@/components/shared/loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useModelConfig, useModelRun, useModelRuns } from "@/lib/hooks";
import type {
  DatasetMlSummary,
  ModelRun,
  ModelTrainBody,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useTrainingContext } from "@/components/training-context";

const WORKFLOW_STEPS = ["Feature Selection (X/Y)", "Workflow & Building", "Training & Optimization", "Results & Leaderboard"] as const;

/** Payload produced by the Manual Workflow (hyperparameters, ensemble, fitting). */
interface ManualTrainPayload {
  /** ML paradigm: supervised (null → inferred), clustering, semi_supervised, reinforcement. */
  task?: string | null;
  model_keys: string[] | null;
  test_size: number;
  cv_folds: number;
  random_state: number | null;
  /** Optuna tuning on/off (the "Optimize" toggle in the Model Fitting panel). */
  tune?: boolean;
  n_trials?: number | null;
  hyperparameters?: Record<string, unknown> | null;
  ensemble?: Record<string, unknown> | null;
  fitting?: Record<string, unknown> | null;
  n_clusters?: number | null;
  linkage?: string | null;
  threshold?: number | null;
  base_estimator?: string | null;
  gamma?: number | null;
  alpha?: number | null;
  max_iterations?: number | null;
  n_bins?: number | null;
}

function WorkflowProgress({ current }: { current: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {WORKFLOW_STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={step}>
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 transition-colors font-medium",
                active && "border-primary bg-primary/10 text-primary shadow-sm",
                done && "border-primary/40 text-foreground bg-primary/5",
                !active && !done && "text-muted-foreground border-border/50",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold font-mono",
                  done ? "bg-primary text-primary-foreground" : "border",
                  active && "border-primary",
                )}
              >
                {done ? <Check className="h-2.5 w-2.5" /> : i + 1}
              </span>
              {step}
            </div>
            {i < WORKFLOW_STEPS.length - 1 && <span className="text-muted-foreground/40">→</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function QualityRing({ score }: { score: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const tone = clamped >= 80 ? "text-emerald-500" : clamped >= 60 ? "text-amber-500" : "text-red-500";
  return (
    <div className="relative h-11 w-11">
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
          className={cn("stroke-current transition-all", tone)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-semibold">
        {Math.round(clamped)}
      </span>
    </div>
  );
}

function SummaryStrip({ summary }: { summary: DatasetMlSummary }) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3.5">
        <div className="flex items-center gap-3">
          <QualityRing score={summary.quality_score} />
          <div>
            <div className="text-[11px] text-muted-foreground">Data Quality</div>
            <div className="text-xs font-semibold">Grade {summary.quality_grade}</div>
          </div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Total Rows</div>
          <div className="font-mono text-xs font-semibold">{summary.rows.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Columns</div>
          <div className="font-mono text-xs font-semibold">{summary.columns.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Missing Cells</div>
          <div className="font-mono text-xs font-semibold">{summary.missing_pct.toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Duplicates</div>
          <div className="font-mono text-xs font-semibold">{summary.duplicate_pct.toFixed(1)}%</div>
        </div>
        {summary.issues.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            {summary.issues.slice(0, 3).map((issue) => (
              <Badge key={issue} variant="outline" className="text-[9px]">
                {issue}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ModelStudioTab({ datasetId }: { datasetId: string }) {
  const { data: config, isLoading: configLoading, isError } = useModelConfig(datasetId);
  const { data: runs } = useModelRuns(datasetId);
  const { activeJob, job, lastRun, startTraining, reconnect } = useTrainingContext();
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";

  const isPending = activeJob?.datasetId === datasetId;

  // Re-attach to background training job upon navigation or page reload
  React.useEffect(() => {
    if (token && datasetId) reconnect(token, datasetId);
  }, [token, datasetId, reconnect]);

  // No default workflow: the user picks Manual or Automated on the cards.
  const [workflow, setWorkflow] = React.useState<WorkflowType | null>(null);
  const [target, setTarget] = React.useState<string>("");
  const [features, setFeatures] = React.useState<string[]>([]);
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);
  // Set when the user deliberately picks "No target" so the seed effect below
  // does not re-override their choice with the default suggestion.
  const [noTargetOverride, setNoTargetOverride] = React.useState(false);
  const { data: selectedRun } = useModelRun(datasetId, selectedRunId);

  // Seed default target & features when config loads
  React.useEffect(() => {
    if (config) {
      const fallbackTarget = config.target_suggestions[0]?.column ?? config.columns[0]?.name ?? "";
      if (!target && !noTargetOverride && fallbackTarget) {
        setTarget(fallbackTarget);
        setFeatures(recommendFeatures(config.columns, fallbackTarget));
      }
    }
  }, [config, target, noTargetOverride]);

  const activeRun: ModelRun | null = selectedRunId
    ? selectedRun ?? null
    : !isPending && lastRun?.dataset_id === datasetId
      ? lastRun
      : null;
  const result = activeRun?.result;

  // A target is required for supervised paradigms but not for clustering; either
  // a target or a feature set makes Step 1 "active".
  const currentStep = isPending ? 2 : result ? 3 : target || features.length ? 1 : 0;

  // Pick a target from the Signal Discovery scan: set it as the Y column and
  // auto-recommend its features, exactly like the default target seeding.
  function handlePickTarget(column: string) {
    setTarget(column);
    setNoTargetOverride(false);
    if (config) setFeatures(recommendFeatures(config.columns, column));
  }

  function runManualTraining(payload: ManualTrainPayload) {
    const task = payload.task ?? null;
    // Clustering is target-less; every other paradigm needs a Y column.
    if (task !== "clustering" && !target) {
      toast.error("Please select a Target Variable (Y) in Step 1.");
      return;
    }
    setSelectedRunId(null);
    const body: ModelTrainBody = {
      target,
      task,
      features: features.length ? features : null,
      model_keys: payload.model_keys,
      test_size: payload.test_size,
      cv_folds: payload.cv_folds,
      tune: payload.tune === true,
      n_trials: payload.n_trials ?? 25,
      random_state: payload.random_state,
      hyperparameters: payload.hyperparameters ?? null,
      ensemble: payload.ensemble ?? null,
      fitting: payload.fitting ?? null,
      n_clusters: payload.n_clusters ?? null,
      linkage: payload.linkage ?? null,
      threshold: payload.threshold ?? null,
      base_estimator: payload.base_estimator ?? null,
      gamma: payload.gamma ?? null,
      alpha: payload.alpha ?? null,
      max_iterations: payload.max_iterations ?? null,
      n_bins: payload.n_bins ?? null,
    };
    startTraining(token, datasetId, body);
  }

  function runAutomatedTraining() {
    if (!target) {
      toast.error("Please select a Target Variable (Y) in Step 1.");
      return;
    }
    setSelectedRunId(null);
    const body: ModelTrainBody = {
      target,
      task: null,
      features: features.length ? features : null,
      tune: true,
      n_trials: 25,
    };
    startTraining(token, datasetId, body);
  }

  // "Retrain with Tweaked Parameters" from the detail modal: retrain the
  // selected model with the user's edited hyperparameters (no re-tuning).
  function handleRetrain(modelKey: string, params: Record<string, any>) {
    if (!target) {
      toast.error("Please select a Target Variable (Y) in Step 1.");
      return;
    }
    setSelectedRunId(null);
    const body: ModelTrainBody = {
      target,
      task: null,
      features: features.length ? features : null,
      model_keys: [modelKey],
      tune: false,
      hyperparameters: params,
    };
    startTraining(token, datasetId, body);
  }

  if (configLoading) return <LoadingLines count={6} />;
  if (isError || !config) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Model Studio Unavailable"
        description="Could not load dataset metadata. Re-upload or refresh."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Step Progress Bar */}
      <div className="flex items-center justify-between gap-3">
        <WorkflowProgress current={currentStep} />
        {runs && runs.length > 0 && (
          <Badge variant="outline" className="text-[10px] font-mono">
            {runs.length} Trained Runs Stored
          </Badge>
        )}
      </div>

      {/* Dataset Summary */}
      {config.summary?.rows != null && <SummaryStrip summary={config.summary} />}

      {/* STEP 1: Feature Selection (X & Y) */}
      <Card className="border-border/70 shadow-sm">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Step 1: Dataset Feature & Target Configuration
            </h3>
            {target && (
              <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                Target: {target} ({features.length} features selected)
              </Badge>
            )}
          </div>
          <FeatureTargetPanel
            config={config}
            target={target}
            features={features}
            allowNoTarget
            onChange={(patch) => {
              if (patch.target !== undefined) {
                setTarget(patch.target);
                setNoTargetOverride(patch.target === "");
              }
              if (patch.features !== undefined) setFeatures(patch.features);
            }}
          />
        </CardContent>
      </Card>

      {/* Signal Discovery Scan: rank targets by achievable score, flag tautologies */}
      <SignalScanPanel
        datasetId={datasetId}
        token={token}
        onPickTarget={handlePickTarget}
      />

      {/* Primary Workflow Selection Cards */}
      <WorkflowSelection selected={workflow} onSelect={setWorkflow} />

      {/* WORKFLOW VIEW 1: MANUAL MODEL BUILDING */}
      {workflow === "manual" && (
        <ManualWorkflow
          config={config}
          target={target}
          features={features}
          onTrain={runManualTraining}
          isPending={isPending}
        />
      )}

      {/* WORKFLOW VIEW 2: AUTOMATED MODEL BUILDING */}
      {workflow === "automated" && (
        <AutomatedWorkflow
          config={config}
          target={target}
          features={features}
          onPredictBestModel={runAutomatedTraining}
          isPending={isPending}
          result={result}
          onRetrain={handleRetrain}
        />
      )}

      {/* Background Training Progress */}
      {isPending && (
        <TrainingProgress
          job={job}
          optimize={activeJob?.optimize ?? true}
        />
      )}

      {/* Detailed Result View & Playground */}
      {!isPending && result && (
        <div className="space-y-6 pt-4 border-t border-border/60">
          <ModelResultView result={result} />
          {activeRun && <Playground datasetId={datasetId} run={activeRun} />}
        </div>
      )}

      {/* Run History Rail */}
      {runs && runs.length > 0 && (
        <div className="space-y-2.5 pt-4 border-t border-border/40">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <History className="h-4 w-4 text-muted-foreground" />
            Previous Model Run History
          </div>
          <div className="flex flex-wrap gap-2">
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelectedRunId(run.id)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-xs transition-all hover:bg-accent",
                  selectedRunId === run.id ? "border-primary bg-primary/10 font-medium" : "border-border/60"
                )}
              >
                <div className="font-semibold text-foreground">{run.best_model_label}</div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  {run.target || run.task} · {run.primary_metric}: {run.primary_score.toFixed(3)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
