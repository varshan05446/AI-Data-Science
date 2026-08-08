"use client";

import { Wrench, Sparkles, Check, ArrowRight, ShieldCheck, Cpu, Sliders, Layers } from "lucide-react";
import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type WorkflowType = "manual" | "automated";

interface WorkflowSelectionProps {
  selected: WorkflowType | null;
  onSelect: (workflow: WorkflowType) => void;
}

export function WorkflowSelection({ selected, onSelect }: WorkflowSelectionProps) {
  return (
    <div className="space-y-4">
      <div className="text-center md:text-left space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Select Model Building Workflow</h2>
        <p className="text-xs text-muted-foreground">
          Choose how you want to build and optimize machine learning models for your dataset.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Card 1: Manual Model Building */}
        <Card
          interactive
          onClick={() => onSelect("manual")}
          className={cn(
            "relative overflow-hidden border-2 transition-all cursor-pointer p-1",
            selected === "manual"
              ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
              : "border-border/70 hover:border-primary/50 hover:bg-accent/40"
          )}
        >
          {selected === "manual" && (
            <div className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Check className="h-3.5 w-3.5" />
            </div>
          )}

          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shadow-sm">
                <Wrench className="h-5 w-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-base">Manual Model Building</h3>
                  <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-400 border-indigo-500/30">
                    Expert Control
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Designed for Data Scientists & ML Engineers</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Full control over algorithm selection, scikit-learn hyperparameters, custom ensemble building, and manual fitting parameters (cross-validation, sampling, encoding, scaling).
            </p>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-primary" />
                Hyperparameter Tuning
              </div>
              <div className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                Ensemble Builder
              </div>
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-primary" />
                ML Categories
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Custom Data Fitting
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-medium text-primary flex items-center gap-1">
                Configure Manual Pipeline
              </span>
              <ArrowRight className="h-4 w-4 text-primary" />
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Automated Model Building */}
        <Card
          interactive
          onClick={() => onSelect("automated")}
          className={cn(
            "relative overflow-hidden border-2 transition-all cursor-pointer p-1",
            selected === "automated"
              ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
              : "border-border/70 hover:border-primary/50 hover:bg-accent/40"
          )}
        >
          {selected === "automated" && (
            <div className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Check className="h-3.5 w-3.5" />
            </div>
          )}

          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-sm">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-base">Automated Model Building</h3>
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                    AI Data Scientist
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">One-click optimization & leaderboard</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Automated hyperparameter optimization (GridSearch), model competition ranking, SHAP explainability, feature importance analysis, and 6 auto-generated ML reports.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                GridSearch Tuning
              </div>
              <div className="flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-emerald-400" />
                Ranked Leaderboard
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                SHAP & Diagnostics
              </div>
              <div className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-emerald-400" />
                6 Auto-Reports
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                Run Automated AutoML
              </span>
              <ArrowRight className="h-4 w-4 text-emerald-400" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
