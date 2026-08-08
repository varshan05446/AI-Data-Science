"use client";

/**
 * A lightweight two-pane resizable split. On large screens it renders the two
 * panes side by side with a draggable divider (mouse + keyboard accessible) and
 * persists the split ratio to localStorage when a `storageKey` is given. Below
 * the `lg` breakpoint it gracefully stacks the panes vertically with no divider,
 * so layouts stay usable on small screens. Purely presentational — it owns no
 * business state, only the split ratio.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export function ResizablePanels({
  left,
  right,
  storageKey,
  defaultLeft = 50,
  min = 25,
  max = 75,
  className,
  stackReversed = false,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  /** When set, the split ratio is persisted under `rp:{storageKey}`. */
  storageKey?: string;
  /** Initial width of the left pane, as a percentage of the container. */
  defaultLeft?: number;
  min?: number;
  max?: number;
  className?: string;
  /** When stacked on mobile, render the right pane first (e.g. sidebars). */
  stackReversed?: boolean;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [pct, setPct] = React.useState(defaultLeft);
  const [dragging, setDragging] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(false);
  const pctRef = React.useRef(pct);
  pctRef.current = pct;

  const clamp = React.useCallback(
    (n: number) => Math.min(max, Math.max(min, n)),
    [min, max],
  );

  // Track the lg breakpoint so we can stack on small screens.
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Restore a persisted ratio.
  React.useEffect(() => {
    if (!storageKey) return;
    const saved = window.localStorage.getItem(`rp:${storageKey}`);
    if (saved != null) {
      const n = Number(saved);
      if (!Number.isNaN(n)) setPct(clamp(n));
    }
  }, [storageKey, clamp]);

  React.useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPct(clamp(((e.clientX - rect.left) / rect.width) * 100));
    }
    function onUp() {
      setDragging(false);
      if (storageKey)
        window.localStorage.setItem(`rp:${storageKey}`, String(Math.round(pctRef.current)));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragging, clamp, storageKey]);

  function onHandleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPct((p) => {
        const n = clamp(p - 2);
        if (storageKey) window.localStorage.setItem(`rp:${storageKey}`, String(Math.round(n)));
        return n;
      });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPct((p) => {
        const n = clamp(p + 2);
        if (storageKey) window.localStorage.setItem(`rp:${storageKey}`, String(Math.round(n)));
        return n;
      });
    }
  }

  // Stacked layout on small screens — no divider, full-width panes.
  if (!isDesktop) {
    return (
      <div className={cn("flex flex-col gap-4", className)}>
        {stackReversed ? (
          <>
            <div className="min-w-0">{right}</div>
            <div className="min-w-0">{left}</div>
          </>
        ) : (
          <>
            <div className="min-w-0">{left}</div>
            <div className="min-w-0">{right}</div>
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("flex items-stretch", className)}>
      <div className="min-w-0" style={{ width: `${pct}%` }}>
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onMouseDown={() => setDragging(true)}
        onKeyDown={onHandleKey}
        className={cn(
          "group relative mx-1 flex w-2 shrink-0 cursor-col-resize items-center justify-center rounded-full outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
        )}
        title="Drag to resize"
      >
        <span
          className={cn(
            "h-10 w-1 rounded-full bg-border transition-colors group-hover:bg-primary/60",
            dragging && "bg-primary",
          )}
        />
      </div>
      <div className="min-w-0 flex-1" style={{ width: `${100 - pct}%` }}>
        {right}
      </div>
    </div>
  );
}
