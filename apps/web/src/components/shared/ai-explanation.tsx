"use client";

import { Sparkles } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * AI explanation block. Visually distinct so users always know when content is
 * AI-generated (core product principle: explain, never hide the reasoning).
 */
export function AiExplanation({
  children,
  label = "AI explanation",
  className,
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-primary/20 bg-primary/5 p-3 text-sm",
        className,
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}
