import * as React from "react";

import { cn } from "@/lib/utils";
import type { QualityScore } from "@/lib/types";

const GRADE_TONE: Record<string, string> = {
  A: "text-success",
  B: "text-success",
  C: "text-warning",
  D: "text-warning",
  F: "text-destructive",
};

const GRADE_RING: Record<string, string> = {
  A: "stroke-success",
  B: "stroke-success",
  C: "stroke-warning",
  D: "stroke-warning",
  F: "stroke-destructive",
};

/** Circular data-quality gauge with a component breakdown. */
export function QualityScoreCard({
  quality,
  className,
}: {
  quality: QualityScore;
  className?: string;
}) {
  const { score, grade, components } = quality;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row", className)}>
      <div className="relative h-28 w-28 shrink-0">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            className="stroke-muted"
            strokeWidth="8"
            fill="none"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            className={cn(GRADE_RING[grade] ?? "stroke-primary")}
            strokeWidth="8"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-2xl font-bold", GRADE_TONE[grade])}>
            {grade}
          </span>
          <span className="text-xs text-muted-foreground">{score}/100</span>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-3">
        {Object.entries(components).map(([key, val]) => (
          <div key={key}>
            <div className="flex items-center justify-between text-xs">
              <span className="capitalize text-muted-foreground">{key}</span>
              <span className="font-medium">{Math.round(val)}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, Math.max(0, val))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
