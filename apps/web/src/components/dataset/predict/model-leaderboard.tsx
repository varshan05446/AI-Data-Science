"use client";

import * as React from "react";
import { Trophy, Clock, Cpu, ChevronRight, Sliders, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface LeaderboardEntry {
  rank: number;
  key: string;
  label: string;
  metrics: Record<string, number>;
  cv_score?: number;
  cv_mean?: number;
  cv_std?: number;
  train_seconds?: number;
  predict_seconds?: number;
  tuned?: boolean;
  best_params?: Record<string, any>;
  error?: string;
}

interface ModelLeaderboardProps {
  leaderboard: LeaderboardEntry[];
  primaryMetric: string;
  selectedKey: string | null;
  onSelectModel: (entry: LeaderboardEntry) => void;
}

export function ModelLeaderboard({
  leaderboard,
  primaryMetric,
  selectedKey,
  onSelectModel,
}: ModelLeaderboardProps) {
  const scored = leaderboard.filter((e) => e.metrics && Object.keys(e.metrics).length > 0);

  return (
    <Card className="border-border/70 shadow-sm overflow-hidden">
      <CardHeader className="pb-3 border-b border-border/40 bg-card">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Trophy className="h-4 w-4 text-amber-400" />
            Model Leaderboard
          </CardTitle>
          <Badge variant="outline" className="text-[10px] font-mono">
            {scored.length} Models Evaluated
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-muted-foreground font-medium">
              <th className="py-2.5 px-3 w-12 text-center">Rank</th>
              <th className="py-2.5 px-4">Model</th>
              <th className="py-2.5 px-4 text-right capitalize">{primaryMetric}</th>
              <th className="py-2.5 px-4 text-right">CV Score</th>
              <th className="py-2.5 px-4 text-right">Train Time</th>
              <th className="py-2.5 px-4 text-right">Pred Time</th>
              <th className="py-2.5 px-4 text-right">Opt Time</th>
              <th className="py-2.5 px-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {scored.map((entry) => {
              const isWinner = entry.rank === 1;
              const isSelected = selectedKey === entry.key;
              const metricVal = entry.metrics[primaryMetric] ?? 0;
              const cvDisplay = entry.cv_mean != null
                ? `${entry.cv_mean.toFixed(3)} ± ${entry.cv_std?.toFixed(3) ?? "0.0"}`
                : entry.cv_score != null
                  ? entry.cv_score.toFixed(3)
                  : "—";

              return (
                <tr
                  key={entry.key}
                  onClick={() => onSelectModel(entry)}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-accent/50",
                    isWinner && "bg-amber-500/5",
                    isSelected && "bg-primary/10 font-medium"
                  )}
                >
                  <td className="py-3 px-3 text-center">
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold font-mono",
                        isWinner
                          ? "bg-amber-500 text-amber-950"
                          : entry.rank === 2
                            ? "bg-slate-300 text-slate-900"
                            : entry.rank === 3
                              ? "bg-amber-700/80 text-white"
                              : "bg-muted text-muted-foreground"
                      )}
                    >
                      {entry.rank}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground">{entry.label}</span>
                      {isWinner && (
                        <Badge variant="secondary" className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/30">
                          Winner
                        </Badge>
                      )}
                      {entry.tuned && (
                        <Badge variant="outline" className="text-[9px] text-primary border-primary/30">
                          Tuned
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-foreground">
                    {metricVal.toFixed(4)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                    {cvDisplay}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                    {entry.train_seconds != null ? `${entry.train_seconds.toFixed(2)}s` : "—"}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                    {entry.predict_seconds != null ? `${entry.predict_seconds.toFixed(3)}s` : "—"}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                    {entry.tuned ? "Optuna Grid" : "Default"}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <ChevronRight className="h-4 w-4 text-muted-foreground inline" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
