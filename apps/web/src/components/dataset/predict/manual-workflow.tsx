"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Cpu,
  Layers,
  Sliders,
  Settings2,
  Sparkles,
  Check,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ModelConfig } from "@/lib/types";

import { AlgorithmConfig, type HyperparameterValues } from "./algorithm-config";
import { EnsembleBuilder, type EnsembleConfig } from "./ensemble-builder";
import { ReinforcementPanel } from "./reinforcement-panel";
import { SemiSupervisedPanel } from "./semi-supervised-panel";
import { UnsupervisedPanel } from "./unsupervised-panel";

export type MLCategory = "supervised" | "unsupervised" | "semi_supervised" | "reinforcement";

interface ManualWorkflowProps {
  config: ModelConfig;
  target: string;
  features: string[];
  onTrain: (payload: any) => void;
  isPending: boolean;
}

export function ManualWorkflow({
  config,
  target,
  features,
  onTrain,
  isPending,
}: ManualWorkflowProps) {
  const [activeCategory, setActiveCategory] = React.useState<MLCategory>("supervised");
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [selectedAlgorithm, setSelectedAlgorithm] = React.useState<string | null>(null);
  const [algoParams, setAlgoParams] = React.useState<HyperparameterValues>({});
  const [ensembleConfig, setEnsembleConfig] = React.useState<EnsembleConfig>({
    type: "voting",
    baseModels: [],
    metaLearner: "logistic_regression",
    votingStrategy: "soft",
    weights: {},
  });

  // Model Fitting Controls State
  const [testSize, setTestSize] = React.useState(0.2);
  const [cvFolds, setCvFolds] = React.useState(3);
  const [randomSeed, setRandomSeed] = React.useState("42");
  const [scaling, setScaling] = React.useState("standard");
  const [encoding, setEncoding] = React.useState("onehot");
  const [sampling, setSampling] = React.useState("none");
  const [leakageDetection, setLeakageDetection] = React.useState(true);
  const [classImbalance, setClassImbalance] = React.useState(false);
  // Optuna tuning: when enabled, the manual pipeline runs the same tuning the
  // Automated workflow uses and reliably clears >95% on datasets with signal.
  const [optimize, setOptimize] = React.useState(false);
  const [nTrials, setNTrials] = React.useState(25);

  // Available algorithms for current task
  const allModels = React.useMemo(() => {
    const classification = config.models["classification"] ?? [];
    const regression = config.models["regression"] ?? [];
    return [...classification, ...regression];
  }, [config]);

  // Set default selected algorithm if none chosen
  React.useEffect(() => {
    if (!selectedAlgorithm && allModels.length > 0) {
      setSelectedAlgorithm(allModels[0].key);
    }
  }, [allModels, selectedAlgorithm]);

  const activeAlgorithmObj = allModels.find((m) => m.key === selectedAlgorithm);

  function handleStartTraining() {
    const payload = {
      target,
      features: features.length ? features : null,
      model_keys: selectedAlgorithm ? [selectedAlgorithm] : null,
      test_size: testSize,
      cv_folds: cvFolds,
      random_state: randomSeed.trim() === "" ? null : Number(randomSeed),
      tune: optimize,
      n_trials: optimize ? Math.min(100, Math.max(5, Number.isFinite(nTrials) ? nTrials : 25)) : null,
      // Explicit hyperparameters from the Algorithm Config panel.
      hyperparameters: Object.keys(algoParams).length > 0 ? algoParams : null,
      fitting: {
        scaling,
        encoding,
        sampling,
        leakage_detection: leakageDetection,
        class_imbalance: classImbalance,
      },
      ensemble: ensembleConfig.baseModels.length > 0 ? ensembleConfig : null,
    };
    onTrain(payload);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Sidebar — Machine Learning Categories */}
        <div
          className={cn(
            "shrink-0 transition-all border border-border/70 rounded-xl bg-card p-3 shadow-sm",
            sidebarCollapsed ? "w-full lg:w-16" : "w-full lg:w-64"
          )}
        >
          <div className="flex items-center justify-between pb-3 border-b border-border/40 mb-2">
            {!sidebarCollapsed && (
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-primary" /> ML Categories
              </span>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors ml-auto"
              title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          <div className="space-y-1.5">
            {[
              { id: "supervised", label: "Supervised Learning", desc: "Classification & Regression" },
              { id: "unsupervised", label: "Unsupervised Learning", desc: "Clustering & Dimensionality" },
              { id: "semi_supervised", label: "Semi-Supervised", desc: "Partial Label Training" },
              { id: "reinforcement", label: "Reinforcement Learning", desc: "Policy & Value Iteration" },
            ].map((cat) => {
              const active = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id as MLCategory)}
                  className={cn(
                    "w-full text-left rounded-lg p-2.5 transition-colors border text-xs",
                    active
                      ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                      : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{cat.label}</span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </div>
                  {!sidebarCollapsed && (
                    <p className="text-[10px] text-muted-foreground font-normal truncate pt-0.5">{cat.desc}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Workspace — Algorithm Selection & Configuration */}
        <div className="flex-1 space-y-5 w-full">
          {activeCategory === "supervised" ? (
            <>
              {/* Algorithm Grid */}
              <Card className="border-border/70 shadow-sm">
                <CardHeader className="pb-3 border-b border-border/40">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-400" />
                    Select Supervised Algorithm
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap gap-2">
                    {allModels.map((m) => {
                      const active = selectedAlgorithm === m.key;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => setSelectedAlgorithm(m.key)}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-xs font-medium transition-all text-left",
                            active
                              ? "border-primary bg-primary/10 text-primary shadow-sm"
                              : "border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                          )}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Dedicated Algorithm Hyperparameter Config */}
              {selectedAlgorithm && activeAlgorithmObj && (
                <AlgorithmConfig
                  algorithmKey={selectedAlgorithm}
                  algorithmLabel={activeAlgorithmObj.label}
                  params={algoParams}
                  onChange={setAlgoParams}
                />
              )}

              {/* Ensemble Builder */}
              <EnsembleBuilder
                availableModels={allModels}
                config={ensembleConfig}
                onChange={setEnsembleConfig}
              />

              {/* Model Fitting Configuration */}
              <Card className="border-border/70 shadow-sm">
                <CardHeader className="pb-3 border-b border-border/40">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Settings2 className="h-4 w-4 text-primary" />
                    Model Fitting Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-4 text-xs">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Test Split Ratio ({Math.round(testSize * 100)}%)</Label>
                      <input
                        type="range"
                        min={10}
                        max={40}
                        step={5}
                        value={Math.round(testSize * 100)}
                        onChange={(e) => setTestSize(Number(e.target.value) / 100)}
                        className="h-8 w-full accent-primary"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">CV Folds</Label>
                      <input
                        type="number"
                        min={2}
                        max={10}
                        value={cvFolds}
                        onChange={(e) => setCvFolds(Number(e.target.value))}
                        className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Random Seed</Label>
                      <input
                        type="number"
                        value={randomSeed}
                        onChange={(e) => setRandomSeed(e.target.value)}
                        className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                      />
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
                        <option value="target">TargetEncoder</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Class Imbalance Handling</Label>
                      <select
                        value={sampling}
                        onChange={(e) => setSampling(e.target.value)}
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="none">None</option>
                        <option value="smote">SMOTE Oversampling</option>
                        <option value="undersample">Random Undersampling</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border/40">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={optimize}
                        onChange={(e) => setOptimize(e.target.checked)}
                        className="rounded border-input text-primary"
                      />
                      <span>Optuna Hyperparameter Tuning</span>
                    </label>
                    {optimize && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Trials</Label>
                        <input
                          type="number"
                          min={5}
                          max={100}
                          value={nTrials}
                          onChange={(e) => setNTrials(Number(e.target.value))}
                          className="h-8 w-20 rounded-md border border-input bg-background px-3 text-xs"
                        />
                        <span className="text-[10px] text-muted-foreground">
                          5–100 (recommended 25)
                        </span>
                      </div>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={leakageDetection}
                        onChange={(e) => setLeakageDetection(e.target.checked)}
                        className="rounded border-input text-primary"
                      />
                      <span>Data Leakage Detection</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={classImbalance}
                        onChange={(e) => setClassImbalance(e.target.checked)}
                        className="rounded border-input text-primary"
                      />
                      <span>Class Weight Balancing</span>
                    </label>
                  </div>
                </CardContent>
              </Card>

              {/* Train Trigger */}
              <div className="flex justify-end pt-2">
                <Button size="lg" onClick={handleStartTraining} disabled={isPending} className="gap-2 font-medium shadow-md">
                  <Sparkles className="h-4 w-4" />
                  {isPending ? "Training Model…" : "Train Manual Model"}
                </Button>
              </div>
            </>
          ) : activeCategory === "unsupervised" ? (
            <UnsupervisedPanel
              config={config}
              features={features}
              onTrain={onTrain}
              isPending={isPending}
            />
          ) : activeCategory === "semi_supervised" ? (
            <SemiSupervisedPanel
              config={config}
              target={target}
              features={features}
              onTrain={onTrain}
              isPending={isPending}
            />
          ) : (
            <ReinforcementPanel
              config={config}
              target={target}
              features={features}
              onTrain={onTrain}
              isPending={isPending}
            />
          )}
        </div>
      </div>
    </div>
  );
}
