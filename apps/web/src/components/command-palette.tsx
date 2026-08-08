"use client";

/**
 * Global command palette (Cmd/Ctrl+K). Provides fast keyboard-driven
 * navigation across the app plus quick actions (theme toggle, jump to a
 * project). Opens via the shortcut or a window `open-command-palette` event so
 * decoupled triggers (e.g. the topbar button) can raise it without shared
 * state. Fully keyboard navigable: arrows to move, Enter to run, Esc to close.
 */
import {
  BrainCircuit,
  Compass,
  Database,
  FileBarChart,
  FlaskConical,
  FolderKanban,
  Key,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  MessageSquare,
  Moon,
  Notebook,
  Search,
  Settings,
  Sparkles,
  Sun,
  Terminal,
  TerminalSquare,
  TestTubes,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { useProjects } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
  run: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const { setTheme, resolvedTheme } = useTheme();
  const { data: projects } = useProjects();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Open via Cmd/Ctrl+K or a custom window event; close on Esc.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  // Reset transient state whenever the palette opens.
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const go = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const commands = React.useMemo<Command[]>(() => {
    const nav: Command[] = [
      {
        id: "nav-dashboard",
        label: "Go to Dashboard",
        icon: LayoutDashboard,
        keywords: "home overview",
        run: () => go("/dashboard"),
      },
      {
        id: "nav-projects",
        label: "Go to Projects",
        icon: FolderKanban,
        keywords: "datasets folders",
        run: () => go("/projects"),
      },
      {
        id: "nav-datasets",
        label: "Go to Datasets",
        icon: Database,
        keywords: "data files tables",
        run: () => go("/datasets"),
      },
      {
        id: "nav-insights",
        label: "Go to AI Insights",
        icon: Sparkles,
        keywords: "findings anomalies recommendations",
        run: () => go("/insights"),
      },
      {
        id: "nav-reports",
        label: "Go to Reports",
        icon: FileBarChart,
        keywords: "export pdf excel",
        run: () => go("/reports"),
      },
      {
        id: "nav-feature-eng",
        label: "Go to Feature Engineering",
        icon: FlaskConical,
        keywords: "transform scaling encoding",
        run: () => go("/feature-engineering"),
      },
      {
        id: "nav-experiments",
        label: "Go to Experiments",
        icon: TestTubes,
        keywords: "compare models metrics",
        run: () => go("/experiments"),
      },
      {
        id: "nav-sql-editor",
        label: "Go to SQL Editor",
        icon: TerminalSquare,
        keywords: "query duckdb database",
        run: () => go("/sql-editor"),
      },
      {
        id: "nav-dashboards",
        label: "Go to Dashboard Builder",
        icon: LayoutGrid,
        keywords: "charts compose pin",
        run: () => go("/dashboard-builder"),
      },
      {
        id: "nav-model-registry",
        label: "Go to Model Registry",
        icon: LineChart,
        keywords: "deploy version production",
        run: () => go("/model-registry"),
      },
      {
        id: "nav-team",
        label: "Go to Team",
        icon: Users,
        keywords: "members invite roles",
        run: () => go("/team"),
      },
      {
        id: "nav-api-keys",
        label: "Go to API Keys",
        icon: Key,
        keywords: "token access programmatic",
        run: () => go("/api-keys"),
      },
      {
        id: "nav-settings",
        label: "Go to Settings",
        icon: Settings,
        keywords: "preferences account",
        run: () => go("/settings"),
      },
      {
        id: "toggle-theme",
        label: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        keywords: "dark light mode appearance",
        run: () => {
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
          setOpen(false);
        },
      },
    ];

    const projectCmds: Command[] = (projects ?? []).map((p) => ({
      id: `project-${p.id}`,
      label: p.name,
      hint: "Project",
      icon: FolderKanban,
      keywords: p.description ?? "",
      run: () => go(`/projects/${p.id}`),
    }));

    // When viewing a dataset, offer quick jumps to its key workspaces.
    const datasetId = pathname?.match(/^\/datasets\/([^/]+)/)?.[1];
    const datasetCmds: Command[] = datasetId
      ? [
          {
            id: "ds-explore",
            label: "Explore this dataset",
            hint: "Dataset",
            icon: Compass,
            keywords: "chart visualize map eda build",
            run: () => go(`/datasets/${datasetId}?tab=eda`),
          },
          {
            id: "ds-train",
            label: "Train a model on this dataset",
            hint: "Dataset",
            icon: Sparkles,
            keywords: "model studio automl predict machine learning",
            run: () => go(`/datasets/${datasetId}?tab=predict`),
          },
          {
            id: "ds-notebook",
            label: "Open Notebook for this dataset",
            hint: "Dataset",
            icon: Terminal,
            keywords: "python code cells jupyter",
            run: () => go(`/datasets/${datasetId}?tab=notebook`),
          },
          {
            id: "ds-chat",
            label: "Chat with this dataset",
            hint: "Dataset",
            icon: MessageSquare,
            keywords: "ask question assistant ai",
            run: () => go(`/datasets/${datasetId}?tab=chat`),
          },
        ]
      : [];

    return [...datasetCmds, ...nav, ...projectCmds];
  }, [projects, resolvedTheme, setTheme, go, pathname]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.hint ?? ""} ${c.keywords ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [commands, query]);

  // Keep the active index within bounds as the list changes.
  React.useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  if (!open) return null;

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[active]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onListKey}
            placeholder="Search actions, pages and projects…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto scrollbar-thin p-2">
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No results for “{query}”.
            </li>
          )}
          {filtered.map((cmd, i) => {
            const Icon = cmd.icon;
            return (
              <li key={cmd.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => cmd.run()}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    i === active
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate text-foreground">
                    {cmd.label}
                  </span>
                  {cmd.hint && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {cmd.hint}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
