"use client";

/**
 * Renders a server-produced statistical chart (Seaborn/Matplotlib) delivered as
 * a base64 PNG + SVG. Mirrors the Plotly renderer's props so ChartFrame can
 * treat both engines uniformly.
 */
import * as React from "react";

import { LoadingLines } from "@/components/shared/loading";
import type { Chart } from "@/lib/types";

export function ImageChart({ chart, height = 288 }: { chart: Chart; height?: number }) {
  const png = chart.image?.png;
  if (!png) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <LoadingLines count={3} className="w-2/3" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center overflow-auto" style={{ minHeight: height }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:image/png;base64,${png}`}
        alt={chart.title}
        className="max-h-full max-w-full object-contain"
        style={{ maxHeight: height }}
      />
    </div>
  );
}
