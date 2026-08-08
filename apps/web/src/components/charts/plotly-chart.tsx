"use client";

/**
 * Theme-aware, SSR-safe wrapper around the heavy Plotly implementation. The
 * implementation is code-split (ssr:false) so plotly.js only ships to the
 * browser and never runs during server rendering.
 */
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import * as React from "react";

import { LoadingLines } from "@/components/shared/loading";
import type { Chart } from "@/lib/types";

const PlotlyChartImpl = dynamic(() => import("./plotly-chart-impl"), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 items-center justify-center">
      <LoadingLines count={3} className="w-2/3" />
    </div>
  ),
});

export function PlotlyChart({ chart, height }: { chart: Chart; height?: number }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="flex h-72 items-center justify-center">
        <LoadingLines count={3} className="w-2/3" />
      </div>
    );
  }
  return (
    <PlotlyChartImpl chart={chart} isDark={resolvedTheme === "dark"} height={height} />
  );
}
