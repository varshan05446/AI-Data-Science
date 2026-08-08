"use client";

/**
 * Client-only Plotly renderer. Built with the factory + plotly.js-dist-min so it
 * never touches `window.Plotly` and can be code-split behind a dynamic import
 * (see plotly-chart.tsx).
 *
 * It renders two families of specs:
 *  - Automatic EDA charts (services/api/.../data/eda.py) — pre-aggregated.
 *  - Interactive Explore charts (services/api/.../data/viz/*) — tidy rows +
 *    an `options` block (palette, opacity, legend, grid, barmode, trendline…).
 * Plotly's modebar provides zoom / pan / export out of the box.
 */
import * as React from "react";
// @ts-expect-error - dist-min has no bundled types; factory accepts it fine.
import Plotly from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";

import { paletteFor } from "@/components/charts/palettes";
import type { Chart } from "@/lib/types";

const Plot = createPlotlyComponent(Plotly);

type Row = Record<string, unknown>;
type Opts = Record<string, unknown>;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** First encoding value for a role (encoding values may be string | string[]). */
function enc(chart: Chart, role: string, fallback = ""): string {
  const v = chart.encoding?.[role];
  if (Array.isArray(v)) return v[0] ?? fallback;
  return (v as string) ?? fallback;
}

function optNum(opts: Opts, key: string, fallback: number): number {
  const v = opts[key];
  return v === undefined || v === null ? fallback : num(v);
}

function optBool(opts: Opts, key: string, fallback: boolean): boolean {
  const v = opts[key];
  return v === undefined ? fallback : Boolean(v);
}

/** Split rows into per-category groups preserving first-seen order. */
function groupBy(rows: Row[], key: string): [string, Row[]][] {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = String(r[key]);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return Array.from(map.entries());
}

/** Scale a numeric column into a pleasant marker-size range. */
function scaleSizes(rows: Row[], key: string, base = 8, span = 26): number[] {
  const vals = rows.map((r) => num(r[key]));
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const range = mx - mn || 1;
  return vals.map((v) => base + ((v - mn) / range) * span);
}

// --- Map traces (scattermapbox / densitymapbox / choropleth) ----------------
function mapTraces(chart: Chart): Partial<Plotly.PlotData>[] {
  const rows = (chart.data ?? []) as Row[];
  const opts = (chart.options ?? {}) as Opts;
  const colors = paletteFor(opts.palette);
  const type = chart.type;
  const lat = enc(chart, "lat", "lat");
  const lon = enc(chart, "lon", "lon");
  const opacity = optNum(opts, "opacity", 0.85);
  const markerSize = optNum(opts, "marker_size", 9);
  const colorScale = (opts.color_scale as string) || "Viridis";

  if (type === "density_map" || type === "heat_map") {
    const z = enc(chart, "z");
    return [
      {
        type: "densitymapbox",
        lat: rows.map((r) => num(r[lat])),
        lon: rows.map((r) => num(r[lon])),
        z: z ? rows.map((r) => num(r[z])) : rows.map(() => 1),
        radius: optNum(opts, "radius", 20),
        colorscale: colorScale,
        showscale: true,
      } as unknown as Partial<Plotly.PlotData>,
    ];
  }

  if (type === "choropleth") {
    const loc = enc(chart, "location", "location");
    const val = enc(chart, "value", "value");
    return [
      {
        type: "choropleth",
        locations: rows.map((r) => String(r[loc])),
        z: rows.map((r) => num(r[val])),
        locationmode: chart.locationmode || chart.map?.locationmode || "country names",
        colorscale: colorScale,
        marker: { line: { width: 0.4, color: "rgba(148,163,184,0.6)" } },
        colorbar: { thickness: 12 },
        hovertemplate: "%{location}<br>%{z}<extra></extra>",
      } as unknown as Partial<Plotly.PlotData>,
    ];
  }

  // scattermapbox family: scatter_map / bubble_map / cluster_map / hexbin_map
  const size = enc(chart, "size");
  const color = enc(chart, "color");
  const colorNumeric = Boolean(opts.color_is_numeric);
  const sizeOf = (r: Row[]) => (size ? scaleSizes(r, size, 7) : markerSize);

  if (color && !colorNumeric) {
    return groupBy(rows, color).map((g, i) => ({
      type: "scattermapbox",
      mode: "markers",
      name: g[0],
      lat: g[1].map((r) => num(r[lat])),
      lon: g[1].map((r) => num(r[lon])),
      marker: { color: colors[i % colors.length], opacity, size: sizeOf(g[1]) },
    })) as unknown as Partial<Plotly.PlotData>[];
  }

  const numericColorKey = type === "hexbin_map" ? size : color && colorNumeric ? color : "";
  return [
    {
      type: "scattermapbox",
      mode: "markers",
      lat: rows.map((r) => num(r[lat])),
      lon: rows.map((r) => num(r[lon])),
      marker: {
        opacity,
        size: sizeOf(rows),
        color: numericColorKey ? rows.map((r) => num(r[numericColorKey])) : colors[0],
        colorscale: numericColorKey ? colorScale : undefined,
        showscale: Boolean(numericColorKey),
      },
      hovertemplate: `${lat}: %{lat}<br>${lon}: %{lon}<extra></extra>`,
    } as unknown as Partial<Plotly.PlotData>,
  ];
}

function mapLayout(chart: Chart, isDark: boolean): Partial<Plotly.Layout> {
  const opts = (chart.options ?? {}) as Opts;
  const font = isDark ? "#e5e7eb" : "#334155";
  const fontSize = optNum(opts, "font_size", 11);
  const base: Partial<Plotly.Layout> = {
    autosize: true,
    margin: { l: 0, r: 0, t: 0, b: 0 },
    paper_bgcolor: "rgba(0,0,0,0)",
    font: { color: font, size: fontSize, family: "inherit" },
    showlegend: optBool(opts, "show_legend", Boolean(chart.encoding?.color)),
    legend: { orientation: "h", y: 0, x: 0, bgcolor: "rgba(0,0,0,0)", font: { size: fontSize - 1 } },
  };
  if (chart.type === "choropleth") {
    const mode = chart.locationmode || chart.map?.locationmode;
    (base as Record<string, unknown>).geo = {
      bgcolor: "rgba(0,0,0,0)",
      showframe: false,
      showcoastlines: true,
      coastlinecolor: isDark ? "#334155" : "#cbd5e1",
      landcolor: isDark ? "#1e293b" : "#f1f5f9",
      lakecolor: "rgba(0,0,0,0)",
      scope: mode === "USA-states" ? "usa" : "world",
    };
    return base;
  }
  const m = chart.map;
  (base as Record<string, unknown>).mapbox = {
    style: m?.style || "carto-positron",
    center: m?.center || { lat: 20, lon: 0 },
    zoom: m?.zoom ?? 1,
  };
  return base;
}

function buildTraces(chart: Chart, isDark: boolean): Partial<Plotly.PlotData>[] {
  if (chart.engine === "map") return mapTraces(chart);
  const { type, data } = chart;
  const rows = (data ?? []) as Row[];
  const opts = (chart.options ?? {}) as Opts;
  const colors = paletteFor(opts.palette);
  const opacity = optNum(opts, "opacity", 0.85);
  const markerSize = optNum(opts, "marker_size", 8);
  const lineWidth = optNum(opts, "line_width", 2);
  const isExplore = chart.engine === "plotly";

  switch (type) {
    case "histogram": {
      // Explore: native histogram over a raw numeric column. EDA: pre-binned bar.
      if (isExplore) {
        const x = enc(chart, "x");
        const color = enc(chart, "color");
        if (color) {
          return groupBy(rows, color).map((g, i) => ({
            type: "histogram",
            name: g[0],
            x: g[1].map((r) => num(r[x])),
            marker: { color: colors[i % colors.length] },
            opacity,
          })) as unknown as Partial<Plotly.PlotData>[];
        }
        return [
          {
            type: "histogram",
            x: rows.map((r) => num(r[x])),
            marker: { color: colors[0] },
            opacity,
            nbinsx: opts.bins ? Math.round(num(opts.bins)) : undefined,
          } as unknown as Partial<Plotly.PlotData>,
        ];
      }
      const x = enc(chart, "x", "bin");
      const y = enc(chart, "y", "count");
      return [
        {
          type: "bar",
          x: rows.map((r) => String(r[x])),
          y: rows.map((r) => num(r[y])),
          marker: { color: colors[0] },
          hovertemplate: "%{x}<br>%{y}<extra></extra>",
        },
      ];
    }
    case "bar": {
      const x = enc(chart, "x", "category");
      const y = enc(chart, "y", "count");
      const color = enc(chart, "color");
      if (color) {
        return groupBy(rows, color).map((g, i) => ({
          type: "bar",
          name: g[0],
          x: g[1].map((r) => String(r[x])),
          y: g[1].map((r) => num(r[y])),
          marker: { color: colors[i % colors.length] },
          opacity,
        }));
      }
      const horizontal = opts.orientation === "h";
      return [
        {
          type: "bar",
          orientation: horizontal ? "h" : "v",
          x: horizontal ? rows.map((r) => num(r[y])) : rows.map((r) => String(r[x])),
          y: horizontal ? rows.map((r) => String(r[x])) : rows.map((r) => num(r[y])),
          marker: { color: colors[0] },
          opacity,
          hovertemplate: "%{x}<br>%{y}<extra></extra>",
        },
      ];
    }
    case "line":
    case "area": {
      const x = enc(chart, "x", "period");
      const y = enc(chart, "y", "value");
      const color = enc(chart, "color");
      const shape = optNum(opts, "smoothing", 1) > 0 ? "spline" : "linear";
      const mk = (name: string, r: Row[], i: number): Partial<Plotly.PlotData> => ({
        type: "scatter",
        mode: "lines+markers",
        name,
        x: r.map((row) => String(row[x])),
        y: r.map((row) => num(row[y])),
        line: { color: colors[i % colors.length], width: lineWidth, shape },
        marker: { size: markerSize / 2 },
        fill: type === "area" ? "tozeroy" : "none",
        opacity: type === "area" ? opacity : 1,
      });
      if (color) return groupBy(rows, color).map((g, i) => mk(g[0], g[1], i));
      return [mk(y, rows, 0)];
    }
    case "scatter":
    case "bubble": {
      const x = enc(chart, "x", "x");
      const y = enc(chart, "y", "y");
      const size = enc(chart, "size");
      const color = enc(chart, "color");
      const colorNumeric = Boolean(opts.color_is_numeric);
      const sizes = (r: Row[]) =>
        size ? r.map((row) => markerSize + num(row[size])) : markerSize;
      const traces: Partial<Plotly.PlotData>[] = [];
      if (color && !colorNumeric) {
        groupBy(rows, color).forEach((g, i) => {
          traces.push({
            type: "scatter",
            mode: "markers",
            name: g[0],
            x: g[1].map((r) => num(r[x])),
            y: g[1].map((r) => num(r[y])),
            marker: { color: colors[i % colors.length], opacity, size: sizes(g[1]) },
          });
        });
      } else {
        traces.push({
          type: "scatter",
          mode: "markers",
          x: rows.map((r) => num(r[x])),
          y: rows.map((r) => num(r[y])),
          marker: {
            opacity,
            size: sizes(rows),
            color: color && colorNumeric ? rows.map((r) => num(r[color])) : colors[0],
            colorscale: color && colorNumeric ? (opts.color_scale as string) || "Viridis" : undefined,
            showscale: Boolean(color && colorNumeric),
            line: { width: 0 },
          },
          hovertemplate: `${x}: %{x}<br>${y}: %{y}<extra></extra>`,
        } as unknown as Partial<Plotly.PlotData>);
      }
      if (chart.trendline) {
        traces.push({
          type: "scatter",
          mode: "lines",
          name: "Trend",
          x: [chart.trendline.x0, chart.trendline.x1],
          y: [chart.trendline.y0, chart.trendline.y1],
          line: { color: "#ef4444", width: 2, dash: "dash" },
          hoverinfo: "skip",
        } as unknown as Partial<Plotly.PlotData>);
      }
      return traces;
    }
    case "boxplot": {
      // Pre-computed 5-number summary (EDA).
      const b = (rows[0] ?? {}) as Record<string, number>;
      return [
        {
          type: "box",
          name: chart.column ?? "",
          q1: [num(b.q1)],
          median: [num(b.median)],
          q3: [num(b.q3)],
          lowerfence: [num(b.min)],
          upperfence: [num(b.max)],
          marker: { color: colors[0] },
          boxpoints: false,
        },
      ];
    }
    case "box": {
      // Raw box plot (Explore), optionally split by category / color.
      const y = enc(chart, "y", "value");
      const x = enc(chart, "x");
      const color = enc(chart, "color");
      const groupKey = color || x;
      if (groupKey) {
        return groupBy(rows, groupKey).map((g, i) => ({
          type: "box",
          name: g[0],
          y: g[1].map((r) => num(r[y])),
          marker: { color: colors[i % colors.length] },
          boxmean: true,
        })) as unknown as Partial<Plotly.PlotData>[];
      }
      return [
        {
          type: "box",
          name: y,
          y: rows.map((r) => num(r[y])),
          marker: { color: colors[0] },
          boxmean: true,
        } as unknown as Partial<Plotly.PlotData>,
      ];
    }
    case "violin": {
      const g = enc(chart, "group", "group");
      const v = enc(chart, "value", "value");
      return [
        {
          type: "violin",
          x: g ? rows.map((r) => String(r[g])) : undefined,
          y: rows.map((r) => num(r[v])),
          points: false,
          box: { visible: true },
          meanline: { visible: true },
          marker: { color: colors[4] },
          line: { color: colors[4] },
        } as unknown as Partial<Plotly.PlotData>,
      ];
    }
    case "pie": {
      const label = enc(chart, "names") || enc(chart, "label", "category");
      const value = enc(chart, "values") || enc(chart, "value", "count");
      return [
        {
          type: "pie",
          labels: rows.map((r) => String(r[label])),
          values: rows.map((r) => num(r[value])),
          hole: optBool(opts, "donut", true) ? 0.45 : 0,
          marker: { colors },
          textinfo: "percent",
          hovertemplate: "%{label}<br>%{value} (%{percent})<extra></extra>",
        } as unknown as Partial<Plotly.PlotData>,
      ];
    }
    case "treemap":
    case "sunburst": {
      const tree = chart.tree;
      if (!tree) return [];
      return [
        {
          type,
          ids: tree.ids,
          labels: tree.labels,
          parents: tree.parents,
          values: tree.values,
          branchvalues: "total",
          marker: { colors: tree.ids.map((_, i) => colors[i % colors.length]) },
          hovertemplate: "%{label}<br>%{value}<extra></extra>",
        } as unknown as Partial<Plotly.PlotData>,
      ];
    }
    case "density_heatmap": {
      const x = enc(chart, "x", "x");
      const y = enc(chart, "y", "y");
      return [
        {
          type: "histogram2d",
          x: rows.map((r) => num(r[x])),
          y: rows.map((r) => num(r[y])),
          colorscale: (opts.color_scale as string) || "Viridis",
          nbinsx: opts.bins ? Math.round(num(opts.bins)) : undefined,
          nbinsy: opts.bins ? Math.round(num(opts.bins)) : undefined,
        } as unknown as Partial<Plotly.PlotData>,
      ];
    }
    case "heatmap": {
      const cols = chart.columns ?? [];
      const lookup = new Map<string, number>();
      for (const cell of rows as { x: string; y: string; value: number }[]) {
        lookup.set(`${cell.x}|${cell.y}`, num(cell.value));
      }
      const z = cols.map((row) => cols.map((col) => lookup.get(`${col}|${row}`) ?? 0));
      return [
        {
          type: "heatmap",
          z,
          x: cols,
          y: cols,
          colorscale: (opts.color_scale as string) || "RdBu",
          reversescale: (opts.color_scale ?? "RdBu") === "RdBu",
          zmid: 0,
          hovertemplate: "%{y} vs %{x}: %{z}<extra></extra>",
        } as unknown as Partial<Plotly.PlotData>,
      ];
    }
    default:
      return [];
  }
}

function buildLayout(chart: Chart, isDark: boolean): Partial<Plotly.Layout> {
  if (chart.engine === "map") return mapLayout(chart, isDark);
  const opts = (chart.options ?? {}) as Opts;
  const font = isDark ? "#e5e7eb" : "#334155";
  const grid = isDark ? "rgba(148,163,184,0.15)" : "rgba(100,116,139,0.15)";
  const showGrid = optBool(opts, "show_grid", true);
  const fontSize = optNum(opts, "font_size", 11);
  const legendPos = (opts.legend_position as string) || "bottom";

  const legendLayouts: Record<string, Partial<Plotly.Legend>> = {
    bottom: { orientation: "h", y: -0.2 },
    top: { orientation: "h", y: 1.1 },
    right: { orientation: "v", x: 1.02, y: 1 },
    left: { orientation: "v", x: -0.2, y: 1 },
  };

  const grouped = chart.type === "pie" || chart.type === "violin";
  const defaultShow = grouped || Boolean(chart.encoding?.color) || Boolean(chart.encoding?.group);
  const base: Partial<Plotly.Layout> = {
    autosize: true,
    margin: { l: 52, r: 16, t: 8, b: 44 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: font, size: fontSize, family: "inherit" },
    showlegend: optBool(opts, "show_legend", defaultShow),
    legend: { ...(legendLayouts[legendPos] ?? legendLayouts.bottom), font: { size: fontSize - 1 } },
    hoverlabel: { font: { size: fontSize } },
    xaxis: { gridcolor: grid, showgrid: showGrid, zeroline: false, automargin: true },
    yaxis: { gridcolor: grid, showgrid: showGrid, zeroline: false, automargin: true },
    barmode: (opts.barmode as Plotly.Layout["barmode"]) || undefined,
  };
  if (chart.type === "pie" || chart.type === "treemap" || chart.type === "sunburst") {
    base.xaxis = undefined;
    base.yaxis = undefined;
  }
  return base;
}

export interface PlotlyChartImplProps {
  chart: Chart;
  isDark: boolean;
  height?: number;
}

export default function PlotlyChartImpl({ chart, isDark, height = 288 }: PlotlyChartImplProps) {
  const traces = React.useMemo(() => buildTraces(chart, isDark), [chart, isDark]);
  const layout = React.useMemo(() => buildLayout(chart, isDark), [chart, isDark]);

  return (
    <Plot
      data={traces as Plotly.Data[]}
      layout={layout}
      useResizeHandler
      style={{ width: "100%", height }}
      config={{
        displaylogo: false,
        responsive: true,
        modeBarButtonsToRemove: ["lasso2d", "select2d"],
        toImageButtonOptions: { format: "png", filename: chart.id, scale: 2 },
      }}
    />
  );
}
