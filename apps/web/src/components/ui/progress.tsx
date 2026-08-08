import { cn } from "@/lib/utils";

/**
 * A thin, accessible progress bar. `tone` colours the fill; `value` is 0-100.
 */
export function Progress({
  value,
  tone = "primary",
  className,
}: {
  value: number;
  tone?: "primary" | "success" | "warning" | "destructive" | "info";
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const fill = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
    info: "bg-info",
  }[tone];
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500", fill)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
