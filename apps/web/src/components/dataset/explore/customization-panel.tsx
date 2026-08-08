"use client";

/**
 * Live customization panel for the Explore builder. Renders adaptive controls
 * driven by the selected chart's catalog metadata: an encoding control per
 * field (X/Y/Color/Size/…) plus the style options the chart supports.
 */
import * as React from "react";

import { Label } from "@/components/ui/label";
import type {
  ChartCatalogEntry,
  ColumnMeta,
  ExplorationCatalog,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ChartConfig {
  encodings: Record<string, string | string[]>;
  options: Record<string, unknown>;
}

const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Native({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {children}
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function columnsForTypes(columns: ColumnMeta[], types: string[]): ColumnMeta[] {
  return columns.filter((c) => types.includes(c.semantic_type));
}

export function CustomizationPanel({
  entry,
  catalog,
  config,
  onChange,
}: {
  entry: ChartCatalogEntry;
  catalog: ExplorationCatalog;
  config: ChartConfig;
  onChange: (next: ChartConfig) => void;
}) {
  const setEncoding = (role: string, value: string | string[]) =>
    onChange({ ...config, encodings: { ...config.encodings, [role]: value } });
  const setOption = (key: string, value: unknown) =>
    onChange({ ...config, options: { ...config.options, [key]: value } });

  const opt = (key: string) => config.options[key];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Data
        </p>
        {entry.encodings.map((e) => {
          const opts = columnsForTypes(catalog.columns, e.types);
          if (e.multiple) {
            const selected = (config.encodings[e.role] as string[]) ?? [];
            return (
              <Field key={e.role} label={e.label + (e.required ? " *" : "")}>
                <div className="flex flex-wrap gap-1.5 rounded-md border border-input p-2">
                  {opts.length === 0 && (
                    <span className="text-xs text-muted-foreground">No suitable columns</span>
                  )}
                  {opts.map((c) => {
                    const on = selected.includes(c.name);
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() =>
                          setEncoding(
                            e.role,
                            on
                              ? selected.filter((s) => s !== c.name)
                              : [...selected, c.name],
                          )
                        }
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-xs transition-colors",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-background hover:bg-accent",
                        )}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </Field>
            );
          }
          return (
            <Field key={e.role} label={e.label + (e.required ? " *" : "")}>
              <Native
                value={(config.encodings[e.role] as string) ?? ""}
                onChange={(v) => setEncoding(e.role, v)}
              >
                <option value="">{e.required ? "Select column…" : "None"}</option>
                {opts.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </Native>
            </Field>
          );
        })}
      </div>

      {entry.options.length > 0 && (
        <div className="space-y-3 border-t pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Style
          </p>
          <div className="grid grid-cols-2 gap-3">
            {entry.options.includes("title") && (
              <div className="col-span-2">
                <Field label="Title">
                  <input
                    className={selectCls}
                    placeholder="Chart title"
                    value={(opt("title") as string) ?? ""}
                    onChange={(e) => setOption("title", e.target.value)}
                  />
                </Field>
              </div>
            )}
            {entry.options.includes("aggregation") && (
              <Field label="Aggregation">
                <Native value={(opt("aggregation") as string) ?? "mean"} onChange={(v) => setOption("aggregation", v)}>
                  {catalog.aggregations.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Native>
              </Field>
            )}
            {entry.options.includes("sort") && (
              <Field label="Sort">
                <Native value={(opt("sort") as string) ?? ""} onChange={(v) => setOption("sort", v)}>
                  <option value="">Default</option>
                  <option value="desc">High → Low</option>
                  <option value="asc">Low → High</option>
                </Native>
              </Field>
            )}
            {entry.options.includes("palette") && (
              <Field label="Palette">
                <Native value={(opt("palette") as string) ?? "indigo"} onChange={(v) => setOption("palette", v)}>
                  {catalog.palettes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Native>
              </Field>
            )}
            {entry.options.includes("map_theme") && (
              <Field label="Map theme">
                <Native value={(opt("map_theme") as string) ?? "light"} onChange={(v) => setOption("map_theme", v)}>
                  {catalog.themes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </Native>
              </Field>
            )}
            {entry.options.includes("locationmode") && (
              <Field label="Region type">
                <Native
                  value={(opt("locationmode") as string) ?? "country names"}
                  onChange={(v) => setOption("locationmode", v)}
                >
                  {catalog.location_modes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </Native>
              </Field>
            )}
            {entry.options.includes("color_scale") && (
              <Field label="Color scale">
                <Native value={(opt("color_scale") as string) ?? ""} onChange={(v) => setOption("color_scale", v)}>
                  <option value="">Default</option>
                  {catalog.color_scales.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Native>
              </Field>
            )}
            {entry.options.includes("barmode") && (
              <Field label="Bar mode">
                <Native value={(opt("barmode") as string) ?? "group"} onChange={(v) => setOption("barmode", v)}>
                  <option value="group">Grouped</option>
                  <option value="stack">Stacked</option>
                </Native>
              </Field>
            )}
            {entry.options.includes("orientation") && (
              <Field label="Orientation">
                <Native value={(opt("orientation") as string) ?? "v"} onChange={(v) => setOption("orientation", v)}>
                  <option value="v">Vertical</option>
                  <option value="h">Horizontal</option>
                </Native>
              </Field>
            )}
            {entry.options.includes("legend_position") && (
              <Field label="Legend">
                <Native value={(opt("legend_position") as string) ?? "bottom"} onChange={(v) => setOption("legend_position", v)}>
                  <option value="bottom">Bottom</option>
                  <option value="top">Top</option>
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                </Native>
              </Field>
            )}
            {entry.options.includes("kind") && (
              <Field label="Kind">
                <Native value={(opt("kind") as string) ?? "scatter"} onChange={(v) => setOption("kind", v)}>
                  <option value="scatter">Scatter</option>
                  <option value="hex">Hexbin</option>
                  <option value="kde">Density</option>
                  <option value="reg">Regression</option>
                </Native>
              </Field>
            )}
            {["limit", "bins", "order", "radius", "grid_size", "n_clusters"].map((k) =>
              entry.options.includes(k) ? (
                <Field key={k} label={k[0].toUpperCase() + k.slice(1).replace("_", " ")}>
                  <input
                    type="number"
                    className={selectCls}
                    value={(opt(k) as number) ?? ""}
                    onChange={(e) =>
                      setOption(k, e.target.value === "" ? undefined : Number(e.target.value))
                    }
                  />
                </Field>
              ) : null,
            )}
            {["opacity"].map((k) =>
              entry.options.includes(k) ? (
                <Field key={k} label="Opacity">
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    className="w-full"
                    value={(opt(k) as number) ?? 0.85}
                    onChange={(e) => setOption(k, Number(e.target.value))}
                  />
                </Field>
              ) : null,
            )}
            {[
              ["marker_size", "Marker size"],
              ["line_width", "Line width"],
              ["font_size", "Font size"],
            ].map(([k, lbl]) =>
              entry.options.includes(k) ? (
                <Field key={k} label={lbl}>
                  <input
                    type="number"
                    className={selectCls}
                    value={(opt(k) as number) ?? ""}
                    onChange={(e) =>
                      setOption(k, e.target.value === "" ? undefined : Number(e.target.value))
                    }
                  />
                </Field>
              ) : null,
            )}
            {[
              ["show_grid", "Show grid"],
              ["donut", "Donut"],
              ["regression", "Trend line"],
              ["smoothing", "Smooth line"],
            ].map(([k, lbl]) =>
              entry.options.includes(k) ? (
                <label key={k} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={Boolean(opt(k))}
                    onChange={(e) => setOption(k, e.target.checked ? (k === "smoothing" ? 1 : true) : k === "smoothing" ? 0 : false)}
                  />
                  {lbl}
                </label>
              ) : null,
            )}
          </div>
        </div>
      )}
    </div>
  );
}
