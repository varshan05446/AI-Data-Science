"use client";

/**
 * Thin wrapper kept for the automatic EDA gallery. All chart chrome (toolbar,
 * fullscreen, export, copy, legend toggle, animation) now lives in the shared
 * premium `ChartFrame`.
 */
import { ChartFrame } from "@/components/charts/chart-frame";
import type { Chart } from "@/lib/types";

export function ChartCard({ chart }: { chart: Chart }) {
  return <ChartFrame chart={chart} category={chart.group ? String(chart.group) : undefined} />;
}
