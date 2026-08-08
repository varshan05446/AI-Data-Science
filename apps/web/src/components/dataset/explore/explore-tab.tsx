"use client";

/**
 * Explore builder orchestrator. Wires the chart-type gallery, the live
 * customization panel and the premium ChartFrame canvas together, plus a
 * "Suggested" strip that reuses the auto-generated EDA gallery. Selecting a
 * chart type computes sensible default encodings; any change rebuilds the chart
 * server-side (debounced) once its required fields are satisfied.
 */
import { Compass, Map as MapIcon, Sparkles } from "lucide-react";
import * as React from "react";

import { ChartFrame } from "@/components/charts/chart-frame";
import { EdaTab } from "@/components/dataset/eda-tab";
import { ChartTypeGallery } from "@/components/dataset/explore/chart-type-gallery";
import {
  CustomizationPanel,
  type ChartConfig,
} from "@/components/dataset/explore/customization-panel";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingLines } from "@/components/shared/loading";
import { Card, CardContent } from "@/components/ui/card";
import { ResizablePanels } from "@/components/ui/resizable";
import { useBuildChart, useChartCatalog } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type {
  ChartCatalogEntry,
  Chart,
  ColumnMeta,
  ExplorationCatalog,
} from "@/lib/types";

type Segment = "chart" | "map";

// Prefer coordinate-looking columns when defaulting lat/lon encodings.
const NAME_HINTS: Record<string, RegExp> = { lat: /lat/i, lon: /lon|lng/i };

function pickDistinct(matches: ColumnMeta[], used: Set<string>): string | undefined {
  const fresh = matches.find((m) => !used.has(m.name));
  return (fresh ?? matches[0])?.name;
}

/** Compute sensible default encodings so a chart renders immediately on select. */
function defaultConfig(entry: ChartCatalogEntry, columns: ColumnMeta[]): ChartConfig {
  const encodings: Record<string, string | string[]> = {};
  const used = new Set<string>();
  for (const e of entry.encodings) {
    const matches = columns.filter((c) => e.types.includes(c.semantic_type));
    if (matches.length === 0) continue;
    if (e.multiple) {
      const cap = e.role === "path" ? 1 : Math.min(matches.length, 5);
      const picked = matches.slice(0, cap).map((c) => c.name);
      if (e.required || ["columns"].includes(e.role)) {
        encodings[e.role] = picked;
        picked.forEach((p) => used.add(p));
      }
    } else if (e.required) {
      const hint = NAME_HINTS[e.role];
      const byName = hint ? matches.find((m) => hint.test(m.name) && !used.has(m.name)) : undefined;
      const name = byName?.name ?? pickDistinct(matches, used);
      if (name) {
        encodings[e.role] = name;
        used.add(name);
      }
    }
  }
  return { encodings, options: {} };
}

function requiredSatisfied(entry: ChartCatalogEntry, encodings: ChartConfig["encodings"]): boolean {
  return entry.encodings.every((e) => {
    if (!e.required) return true;
    const v = encodings[e.role];
    if (e.multiple) return Array.isArray(v) && v.length > 0;
    return typeof v === "string" && v.length > 0;
  });
}

function ExploreBuilder({ catalog, segment }: { catalog: ExplorationCatalog; segment: Segment }) {
  const build = useBuildChart(catalog.dataset_id);
  const segmentCharts = React.useMemo(
    () => catalog.charts.filter((c) => (c.segment ?? "chart") === segment),
    [catalog.charts, segment],
  );
  const enabledCharts = React.useMemo(
    () => segmentCharts.filter((c) => c.enabled),
    [segmentCharts],
  );

  const initial = React.useMemo(() => {
    const featured = enabledCharts.find((c) => c.featured);
    return featured?.id ?? enabledCharts[0]?.id ?? "";
  }, [enabledCharts]);

  const [selected, setSelected] = React.useState(initial);
  const entry = React.useMemo(
    () => segmentCharts.find((c) => c.id === selected),
    [segmentCharts, selected],
  );
  const [config, setConfig] = React.useState<ChartConfig>(() =>
    entry ? defaultConfig(entry, catalog.columns) : { encodings: {}, options: {} },
  );
  const [chart, setChart] = React.useState<Chart | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function selectType(id: string) {
    const next = segmentCharts.find((c) => c.id === id);
    if (!next) return;
    setSelected(id);
    setConfig(defaultConfig(next, catalog.columns));
  }

  // Debounced auto-build whenever the type or config changes.
  const specKey = React.useMemo(() => JSON.stringify({ selected, config }), [selected, config]);
  React.useEffect(() => {
    if (!entry || !requiredSatisfied(entry, config.encodings)) return;
    const handle = setTimeout(() => {
      build.mutate(
        { chart_type: selected, encodings: config.encodings, options: config.options },
        {
          onSuccess: (res) => {
            setChart(res.chart);
            setError(null);
          },
          onError: (err) => setError(err instanceof Error ? err.message : "Failed to build chart."),
        },
      );
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey]);

  if (!entry) {
    return (
      <EmptyState
        icon={segment === "map" ? MapIcon : Compass}
        title={segment === "map" ? "No maps available" : "No chart types available"}
        description={
          segment === "map"
            ? "This dataset doesn't have latitude/longitude or region columns suitable for maps."
            : "This dataset doesn't have columns suitable for the available visualizations."
        }
      />
    );
  }

  const canRender = requiredSatisfied(entry, config.encodings);

  return (
    <div className="space-y-4">
      <ChartTypeGallery
        charts={segmentCharts}
        categories={segment === "map" ? catalog.map_categories : catalog.categories}
        selected={selected}
        onSelect={selectType}
      />

      <ResizablePanels
        storageKey="explore-split"
        defaultLeft={28}
        min={20}
        max={45}
        className="gap-0"
        left={
          <Card className="lg:sticky lg:top-4 lg:self-start">
            <CardContent className="max-h-[70vh] overflow-y-auto pt-6">
              <div className="mb-3">
                <p className="text-sm font-semibold">{entry.label}</p>
                <p className="text-xs text-muted-foreground">{entry.description}</p>
              </div>
              <CustomizationPanel
                entry={entry}
                catalog={catalog}
                config={config}
                onChange={setConfig}
              />
            </CardContent>
          </Card>
        }
        right={
          <div className="min-w-0">
            {!canRender ? (
              <EmptyState
                icon={Compass}
                title="Choose your fields"
                description="Select the required columns in the panel to render this chart."
              />
            ) : error ? (
              <EmptyState icon={Compass} title="Could not build chart" description={error} />
            ) : chart ? (
              <ChartFrame chart={chart} height={440} category={entry.category} />
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <LoadingLines count={6} />
                </CardContent>
              </Card>
            )}
          </div>
        }
      />

      {segment === "chart" && (
        <details className="group rounded-lg border bg-card">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Suggested charts
            <span className="text-xs font-normal text-muted-foreground">
              (auto-generated from the dataset profile)
            </span>
          </summary>
          <div className="border-t p-4">
            <EdaTab datasetId={catalog.dataset_id} />
          </div>
        </details>
      )}
    </div>
  );
}

const SEGMENTS: { id: Segment; label: string; icon: typeof Compass }[] = [
  { id: "chart", label: "Visualizations", icon: Compass },
  { id: "map", label: "Maps", icon: MapIcon },
];

function ExploreWorkspace({ catalog }: { catalog: ExplorationCatalog }) {
  const [segment, setSegment] = React.useState<Segment>("chart");
  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
        {SEGMENTS.map((s) => {
          const Icon = s.icon;
          const active = s.id === segment;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSegment(s.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {s.label}
            </button>
          );
        })}
      </div>
      <ExploreBuilder key={segment} segment={segment} catalog={catalog} />
    </div>
  );
}

export function ExploreTab({ datasetId }: { datasetId: string }) {
  const { data, isLoading, isError } = useChartCatalog(datasetId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <LoadingLines count={8} />
        </CardContent>
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <EmptyState
        icon={Compass}
        title="Explore unavailable"
        description="Could not load the visualization catalog for this dataset."
      />
    );
  }
  return <ExploreWorkspace catalog={data} />;
}
