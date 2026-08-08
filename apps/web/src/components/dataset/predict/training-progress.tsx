"use client";

/**
 * Live training progress card. Renders the *real* progress, stage and rolling
 * logs of the background TrainingJob (streamed via polling from the training
 * context) — the job runs server-side, so this card can unmount at any time
 * (navigation, refresh) and re-attach later without affecting training.
 */
import {
  Binary,
  Check,
  Cpu,
  ListChecks,
  Loader2,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
  Split,
} from "lucide-react";
import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import type { TrainingJob } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Stage {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Backend stage names that belong to this step. */
  matches: string[];
}

const ALL_STAGES: Stage[] = [
  { key: "detect", label: "Detecting task", icon: ScanSearch, matches: ["queued", "starting", "load", "detect"] },
  { key: "preprocess", label: "Preparing features", icon: Binary, matches: ["preprocess"] },
  { key: "split", label: "Splitting train / test", icon: Split, matches: ["split"] },
  { key: "train", label: "Training models", icon: Cpu, matches: ["train"] },
  { key: "optimize", label: "Optimizing hyperparameters", icon: SlidersHorizontal, matches: ["optimize"] },
  { key: "validate", label: "Cross-validating", icon: ListChecks, matches: ["cross_validate"] },
  { key: "explain", label: "Explaining results", icon: Sparkles, matches: ["explain", "finalize", "save", "done"] },
];

export function TrainingProgress({
  job,
  optimize,
}: {
  job: TrainingJob | null;
  optimize: boolean;
}) {
  const stages = React.useMemo(
    () => (optimize ? ALL_STAGES : ALL_STAGES.filter((s) => s.key !== "optimize")),
    [optimize],
  );

  const stageName = job?.stage ?? "queued";
  let index = stages.findIndex((s) => s.matches.includes(stageName));
  if (index < 0) index = 0;

  const pct = Math.min(99, Math.max(1, Math.round(job?.progress ?? 1)));
  const logs = job?.logs ?? [];
  const recent = logs.slice(-4);

  const logRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs.length]);

  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div className="flex-1">
            <div className="text-sm font-medium">{stages[index].label}…</div>
            <div className="text-xs text-muted-foreground">
              Training runs in the background — you can navigate anywhere and come back.
            </div>
          </div>
          <span className="font-mono text-sm font-semibold text-primary">{pct}%</span>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {stages.map((stage, i) => {
            const done = i < index;
            const current = i === index;
            const Icon = stage.icon;
            return (
              <React.Fragment key={stage.key}>
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors",
                    current && "border-primary bg-primary/10 text-primary",
                    done && "border-primary/40 text-foreground",
                    !current && !done && "text-muted-foreground opacity-60",
                  )}
                >
                  {done ? (
                    <Check className="h-3 w-3 text-primary" />
                  ) : current ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Icon className="h-3 w-3" />
                  )}
                  {stage.label.split(" ")[0]}
                </div>
                {i < stages.length - 1 && <span className="text-muted-foreground/40">→</span>}
              </React.Fragment>
            );
          })}
        </div>

        {recent.length > 0 && (
          <div
            ref={logRef}
            className="max-h-24 space-y-1 overflow-y-auto rounded-md border bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground"
          >
            {recent.map((entry, i) => (
              <div key={`${entry.ts}-${i}`} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground/60">
                  {new Date(entry.ts).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className="text-foreground/80">{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
