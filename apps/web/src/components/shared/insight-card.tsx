import {
  AlertTriangle,
  ArrowRight,
  Info,
  Lightbulb,
  TrendingUp,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Insight } from "@/lib/types";
import { cn } from "@/lib/utils";

const SEVERITY: Record<
  Insight["severity"],
  { label: string; variant: "default" | "warning" | "destructive" | "secondary"; icon: React.ComponentType<{ className?: string }> }
> = {
  high: { label: "High priority", variant: "destructive", icon: AlertTriangle },
  medium: { label: "Medium", variant: "warning", icon: TrendingUp },
  low: { label: "Low", variant: "secondary", icon: Info },
  info: { label: "Info", variant: "secondary", icon: Info },
};

function confidenceTone(c: number): string {
  if (c >= 0.75) return "text-success";
  if (c >= 0.5) return "text-warning";
  return "text-muted-foreground";
}

/**
 * The signature insight card: What we found / Why it happens / Recommendation /
 * Business impact / Confidence — the product's explainability contract.
 */
export function InsightCard({
  insight,
  className,
}: {
  insight: Insight;
  className?: string;
}) {
  const sev = SEVERITY[insight.severity] ?? SEVERITY.info;
  const SevIcon = sev.icon;
  return (
    <Card className={cn("flex flex-col gap-4 p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-primary/10 p-1.5 text-primary">
            <Lightbulb className="h-4 w-4" />
          </div>
          <h3 className="font-semibold leading-tight">{insight.title}</h3>
        </div>
        <Badge variant={sev.variant} className="shrink-0 gap-1">
          <SevIcon className="h-3 w-3" />
          {sev.label}
        </Badge>
      </div>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What we found
          </dt>
          <dd className="mt-0.5 text-foreground/90">{insight.what_we_found}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Why it happens
          </dt>
          <dd className="mt-0.5 text-foreground/90">{insight.why_it_happens}</dd>
        </div>
        <div className="rounded-md bg-muted/50 p-3">
          <dt className="flex items-center gap-1 text-xs font-medium text-primary">
            <ArrowRight className="h-3 w-3" /> Recommendation
          </dt>
          <dd className="mt-0.5 text-foreground/90">{insight.recommendation}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Business impact
          </dt>
          <dd className="mt-0.5 text-foreground/90">{insight.business_impact}</dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center justify-between border-t pt-3">
        <div className="flex flex-wrap gap-1">
          {insight.tags.map((t) => (
            <span
              key={t}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
        <span className={cn("text-xs font-medium", confidenceTone(insight.confidence))}>
          {Math.round(insight.confidence * 100)}% confidence
        </span>
      </div>
    </Card>
  );
}
