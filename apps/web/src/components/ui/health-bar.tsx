import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

/**
 * A labelled metric row (label + value + thin bar), used in dataset-health
 * strips for quality, missing, duplicates and outlier ratios.
 */
export function HealthBar({
  label,
  value,
  tone = "primary",
  suffix = "%",
  className,
}: {
  label: string;
  value: number;
  tone?: "primary" | "success" | "warning" | "destructive" | "info";
  suffix?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {Math.round(value)}
          {suffix}
        </span>
      </div>
      <Progress value={value} tone={tone} />
    </div>
  );
}
