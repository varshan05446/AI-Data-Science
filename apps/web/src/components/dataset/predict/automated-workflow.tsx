"use client";

import * as React from "react";
import { Sparkles, Trophy, Sliders, ShieldCheck, FileText } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { ModelLeaderboard, type LeaderboardEntry } from "./model-leaderboard";
import { ModelReports } from "./model-reports";
import { ModelDetailModal } from "./model-detail-modal";

interface AutomatedWorkflowProps {
  config: any;
  target: string;
  features: string[];
  onPredictBestModel: () => void;
  isPending: boolean;
  result: any;
  onRetrain: (modelKey: string, params: Record<string, any>) => void;
}

export function AutomatedWorkflow({
  config,
  target,
  features,
  onPredictBestModel,
  isPending,
  result,
  onRetrain,
}: AutomatedWorkflowProps) {
  const [selectedEntry, setSelectedEntry] = React.useState<LeaderboardEntry | null>(null);
  const [detailModalOpen, setDetailModalOpen] = React.useState(false);

  const leaderboard: LeaderboardEntry[] = result?.leaderboard ?? [];
  const primaryMetric = result?.primary_metric ?? "accuracy";

  function handleSelectModel(entry: LeaderboardEntry) {
    setSelectedEntry(entry);
    setDetailModalOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Trigger Card */}
      <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5 px-6">
          <div className="flex items-center gap-3.5">
            <div className="rounded-xl bg-emerald-500/15 p-2.5 text-emerald-400 border border-emerald-500/20 shadow-sm">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base">AI Data Scientist AutoML Engine</h3>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  GridSearch Hyperparameter Optimization
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground pt-0.5">
                Target: <strong className="font-mono text-foreground">{target || "Not Selected"}</strong> · {features.length} Features Selected
              </p>
            </div>
          </div>

          <Button
            size="lg"
            onClick={onPredictBestModel}
            disabled={isPending || !target}
            className="gap-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold shadow-md"
          >
            <Sparkles className="h-4 w-4" />
            {isPending ? "Optimizing & Training…" : "Predict Best Model"}
          </Button>
        </CardContent>
      </Card>

      {/* Leaderboard View */}
      {leaderboard.length > 0 && (
        <ModelLeaderboard
          leaderboard={leaderboard}
          primaryMetric={primaryMetric}
          selectedKey={selectedEntry?.key ?? null}
          onSelectModel={handleSelectModel}
        />
      )}

      {/* Reports View */}
      {result && <ModelReports result={result} />}

      {/* Detailed Analysis Modal */}
      {selectedEntry && (
        <ModelDetailModal
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          entry={selectedEntry}
          result={result}
          onRetrain={onRetrain}
        />
      )}
    </div>
  );
}
