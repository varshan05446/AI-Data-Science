"use client";

/**
 * Renders backend-generated chart specs with Recharts. The backend returns
 * data + a light encoding spec (see services/api/app/services/data/eda.py);
 * this component maps each chart `type` to the right visualization.
 */
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import type { Chart } from "@/lib/types";

const AXIS = "hsl(var(--muted-foreground))";
const GRID = "hsl(var(--border))";
const PRIMARY = "hsl(var(--primary))";

function ChartFrame({ children }: { children: React.ReactElement }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
};

function heatColor(v: number): string {
  // Diverging scale: blue (neg) -> neutral -> indigo (pos).
  const a = Math.min(Math.abs(v), 1);
  if (v >= 0) return `hsl(243 75% 59% / ${0.12 + a * 0.8})`;
  return `hsl(0 72% 51% / ${0.12 + a * 0.8})`;
}

/** Coerce an encoding value (now `string | string[]`) to a single dataKey. */
function key(v: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(v)) return v[0] ?? fallback;
  return v ?? fallback;
}

export function ChartRenderer({ chart }: { chart: Chart }) {
  const { type, data, encoding } = chart;

  if (type === "histogram" || type === "bar") {
    const x = key(encoding.x, "bin");
    const y = key(encoding.y, "count");
    return (
      <ChartFrame>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis
            dataKey={x}
            tick={{ fontSize: 11, fill: AXIS }}
            interval={0}
            angle={-25}
            textAnchor="end"
            height={56}
          />
          <YAxis tick={{ fontSize: 11, fill: AXIS }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
          <Bar dataKey={y} fill={PRIMARY} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartFrame>
    );
  }

  if (type === "line") {
    const x = key(encoding.x, "period");
    const y = key(encoding.y, "value");
    return (
      <ChartFrame>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey={x} tick={{ fontSize: 11, fill: AXIS }} />
          <YAxis tick={{ fontSize: 11, fill: AXIS }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line
            type="monotone"
            dataKey={y}
            stroke={PRIMARY}
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ChartFrame>
    );
  }

  if (type === "scatter") {
    const x = key(encoding.x, "x");
    const y = key(encoding.y, "y");
    return (
      <ChartFrame>
        <ScatterChart margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis
            type="number"
            dataKey={x}
            name={x}
            tick={{ fontSize: 11, fill: AXIS }}
          />
          <YAxis
            type="number"
            dataKey={y}
            name={y}
            tick={{ fontSize: 11, fill: AXIS }}
          />
          <ZAxis range={[36, 36]} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={data} fill={PRIMARY} fillOpacity={0.6} />
        </ScatterChart>
      </ChartFrame>
    );
  }

  if (type === "boxplot") {
    const b = (data[0] ?? {}) as Record<string, number>;
    const rows: [string, number | undefined][] = [
      ["Min", b.min],
      ["Q1", b.q1],
      ["Median", b.median],
      ["Q3", b.q3],
      ["Max", b.max],
    ];
    return (
      <div className="grid grid-cols-5 gap-2 py-6">
        {rows.map(([label, val]) => (
          <div key={label} className="rounded-md border bg-muted/30 p-3 text-center">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 font-mono text-sm font-medium">
              {val === undefined ? "-" : Number(val).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "heatmap") {
    const cols = chart.columns ?? [];
    const lookup = new Map<string, number>();
    for (const cell of data as { x: string; y: string; value: number }[]) {
      lookup.set(`${cell.x}|${cell.y}`, cell.value);
    }
    return (
      <div className="overflow-auto scrollbar-thin py-2">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <th />
              {cols.map((c) => (
                <th
                  key={c}
                  className="px-1 text-[10px] font-medium text-muted-foreground"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cols.map((row) => (
              <tr key={row}>
                <td className="pr-2 text-right text-[10px] font-medium text-muted-foreground">
                  {row}
                </td>
                {cols.map((col) => {
                  const v = lookup.get(`${col}|${row}`) ?? 0;
                  return (
                    <td
                      key={col}
                      title={`${row} vs ${col}: ${v}`}
                      className="h-9 w-9 rounded text-center text-[10px] font-medium"
                      style={{ backgroundColor: heatColor(v) }}
                    >
                      {v.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
      Unsupported chart type: {type}
    </div>
  );
}
