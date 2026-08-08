"use client";

import {
  BarChart3,
  BrainCircuit,
  Database,
  FileBarChart,
  FlaskConical,
  FolderKanban,
  Home,
  Key,
  LayoutGrid,
  LineChart,
  Notebook,
  Settings,
  Sparkles,
  TerminalSquare,
  TestTubes,
  Users,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import * as React from "react";

import { useCopilot } from "@/components/copilot/copilot-context";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  datasetTab?: string;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const TOP_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
];

const NAV_GROUPS: NavGroup[] = [
  {
    label: "WORKSPACE",
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/datasets", label: "Datasets", icon: Database },
      { href: "/insights", label: "AI Insights", icon: Sparkles },
      { href: "/reports", label: "Reports", icon: FileBarChart },
    ],
  },
  {
    label: "ANALYSIS",
    items: [
      { href: "/datasets", label: "Explore", icon: BarChart3, datasetTab: "eda" },
      { href: "/datasets", label: "Data Cleaning", icon: Wand2, datasetTab: "cleaning" },
      { href: "/feature-engineering", label: "Feature Engineering", icon: FlaskConical },
      { href: "/datasets", label: "Models", icon: BrainCircuit, datasetTab: "predict" },
      { href: "/experiments", label: "Experiments", icon: TestTubes },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { href: "/sql-editor", label: "SQL Editor", icon: TerminalSquare },
      { href: "/datasets", label: "Python Notebook", icon: Notebook, datasetTab: "notebook" },
    ],
  },
  {
    label: "ADMINISTRATION",
    items: [
      { href: "/team", label: "Team", icon: Users },
      { href: "/api-keys", label: "API Keys", icon: Key },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { activeDatasetId } = useCopilot();

  function resolveHref(item: NavItem): string {
    if (item.datasetTab && activeDatasetId) {
      return `/datasets/${activeDatasetId}?tab=${item.datasetTab}`;
    }
    return item.href;
  }

  function isActive(item: NavItem): boolean {
    if (item.label === "Home") {
      return pathname === "/" || pathname === "/dashboard";
    }
    if (item.datasetTab) {
      return pathname.includes("/datasets/") && pathname.includes(item.datasetTab);
    }
    return pathname === item.href || (item.href !== "/projects" && pathname.startsWith(`${item.href}/`));
  }

  return (
    <aside
      className={cn(
        "flex h-full w-[15.5rem] shrink-0 flex-col border-r border-border/60 bg-card/60 backdrop-blur-sm",
        className,
      )}
    >
      {/* Branding Header */}
      <div className="flex h-14 items-center gap-3 border-b border-border/60 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-glow-sm">
          <Sparkles className="h-4.5 w-4.5" />
        </div>
        <span className="text-base font-bold tracking-tight text-foreground">DataMind AI</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin space-y-4">
        {/* Top level item (Home) */}
        <div>
          <ul className="space-y-0.5">
            {TOP_ITEMS.map((item) => {
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <li key={item.label}>
                  <Link
                    href={resolveHref(item)}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all",
                      active
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:bg-surface hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Grouped Nav Items */}
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <li key={item.label}>
                    <Link
                      href={resolveHref(item)}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                        active
                          ? "bg-primary/15 text-primary font-semibold"
                          : "text-muted-foreground hover:bg-surface hover:text-foreground",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                      )}
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom Footer Card */}
      <div className="border-t border-border/60 p-3">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
          <div className="flex items-center gap-2 text-primary font-semibold mb-1">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Explainable by design</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Every insight shows what, why, and the recommended action.
          </p>
        </div>
      </div>
    </aside>
  );
}
