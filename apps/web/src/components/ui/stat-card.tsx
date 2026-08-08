import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A metric tile for dashboard rows: a label, a large value, an optional
 * month-over-month delta with directional colouring, and an accent icon.
 */
export function StatCard({
  label,
  value,
  delta,
  hint,
  icon: Icon,
  iconBg = "bg-primary/10 text-primary",
  className,
}: {
  label: string;
  value: ReactNode;
  /** Percentage change vs. the previous period (e.g. 12 or -4). */
  delta?: number;
  /** Small clarifying text shown under the value. */
  hint?: string;
  icon?: LucideIcon;
  iconBg?: string;
  className?: string;
}) {
  const hasDelta = typeof delta === "number" && !Number.isNaN(delta);
  const up = (delta ?? 0) >= 0;
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-lift",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {Icon && (
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border border-border/40",
              iconBg,
            )}
          >
            <Icon className="h-4.5 w-4.5" />
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-foreground">{value}</span>
      </div>
      {hint && (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      )}
      {hasDelta && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold",
              up ? "text-emerald-400" : "text-red-400",
            )}
          >
            {up ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {Math.abs(delta as number)}%
          </span>
          <span className="text-[11px] text-muted-foreground">vs last month</span>
        </div>
      )}
    </div>
  );
}
