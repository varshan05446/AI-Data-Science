"use client";

/**
 * Chart-type picker for the Explore builder. Shows large cards for the common
 * (featured) chart types and a "More Visualizations" dropdown that reveals every
 * type grouped by category. Disabled types (unsatisfiable by the dataset) render
 * dimmed and non-interactive.
 */
import {
  Activity,
  AreaChart,
  BarChart3,
  Box,
  ChevronDown,
  Circle,
  Flame,
  Grid2x2,
  Grid3x3,
  Group,
  LayoutDashboard,
  LineChart,
  Loader,
  Map as MapIcon,
  MapPin,
  PieChart,
  ScatterChart,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
} from "@/components/ui/dropdown-menu";
import type { ChartCatalogEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "bar-chart-3": BarChart3,
  box: Box,
  activity: Activity,
  "line-chart": LineChart,
  "area-chart": AreaChart,
  "scatter-chart": ScatterChart,
  circle: Circle,
  "grid-3x3": Grid3x3,
  "grid-2x2": Grid2x2,
  "pie-chart": PieChart,
  "layout-dashboard": LayoutDashboard,
  loader: Loader,
  "trending-up": TrendingUp,
  "map-pin": MapPin,
  group: Group,
  flame: Flame,
  map: MapIcon,
};

function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? BarChart3;
}

export function ChartTypeGallery({
  charts,
  categories,
  selected,
  onSelect,
}: {
  charts: ChartCatalogEntry[];
  categories: string[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const featured = charts.filter((c) => c.featured);
  const byCategory = React.useMemo(() => {
    const map = new Map<string, ChartCatalogEntry[]>();
    for (const cat of categories) map.set(cat, []);
    for (const c of charts) {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    }
    return map;
  }, [charts, categories]);

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {featured.map((c) => {
        const Icon = iconFor(c.icon);
        const active = c.id === selected;
        return (
          <button
            key={c.id}
            type="button"
            disabled={!c.enabled}
            title={c.enabled ? c.description : "Not enough suitable columns for this chart"}
            onClick={() => onSelect(c.id)}
            className={cn(
              "group flex w-[132px] flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all",
              active
                ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                : "border-input bg-card hover:border-primary/40 hover:bg-accent",
              !c.enabled && "pointer-events-none opacity-40",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-xs font-medium leading-tight">{c.label}</span>
          </button>
        );
      })}

      <DropdownMenu
        align="start"
        trigger={
          <Button variant="outline" className="h-full min-h-[76px] w-[132px] flex-col gap-2 rounded-xl">
            <ChevronDown className="h-5 w-5" />
            <span className="text-xs font-medium">More Visualizations</span>
          </Button>
        }
        className="max-h-[420px] w-64 overflow-y-auto"
      >
        {categories.map((cat, idx) => {
          const items = byCategory.get(cat) ?? [];
          if (items.length === 0) return null;
          return (
            <React.Fragment key={cat}>
              {idx > 0 && <DropdownSeparator />}
              <DropdownLabel>{cat}</DropdownLabel>
              {items.map((c) => {
                const Icon = iconFor(c.icon);
                return (
                  <DropdownItem
                    key={c.id}
                    disabled={!c.enabled}
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      "flex items-center gap-2",
                      c.id === selected && "bg-accent",
                      !c.enabled && "opacity-40",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.engine === "image" && (
                      <Badge variant="secondary" className="text-[9px]">
                        stat
                      </Badge>
                    )}
                  </DropdownItem>
                );
              })}
            </React.Fragment>
          );
        })}
      </DropdownMenu>
    </div>
  );
}
