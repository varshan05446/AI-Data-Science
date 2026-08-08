import { cn } from "@/lib/utils";

/**
 * A small, dot-prefixed status label used across projects, datasets and models.
 * Tones map to the semantic palette; unknown statuses fall back to a neutral
 * tone so new backend states never break the UI.
 */
export type StatusTone =
  | "active"
  | "draft"
  | "archived"
  | "ready"
  | "profiling"
  | "error";

const TONES: Record<StatusTone, { dot: string; text: string; bg: string }> = {
  active: { dot: "bg-success", text: "text-success", bg: "bg-success/10" },
  ready: { dot: "bg-success", text: "text-success", bg: "bg-success/10" },
  profiling: { dot: "bg-info animate-pulse", text: "text-info", bg: "bg-info/10" },
  draft: {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-muted",
  },
  archived: {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-muted",
  },
  error: {
    dot: "bg-destructive",
    text: "text-destructive",
    bg: "bg-destructive/10",
  },
};

function resolveTone(status: string): StatusTone {
  const s = status.toLowerCase();
  if (s in TONES) return s as StatusTone;
  if (["completed", "done", "success", "live"].includes(s)) return "active";
  if (["processing", "running", "pending", "training"].includes(s))
    return "profiling";
  if (["failed", "errored"].includes(s)) return "error";
  return "draft";
}

export function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = TONES[resolveTone(status)];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        tone.bg,
        tone.text,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} aria-hidden />
      {status}
    </span>
  );
}
