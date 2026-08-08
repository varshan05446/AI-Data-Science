"use client";

import { Bell, ChevronDown, LogOut, Search, Sparkles, User as UserIcon } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

import { useCopilot } from "@/components/copilot/copilot-context";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function Topbar() {
  const { data: session } = useSession();
  const { open: copilotOpen, toggle: toggleCopilot } = useCopilot();
  const name = session?.user?.name ?? "Arjun Mehta";
  const email = session?.user?.email ?? "arjun.mehta@datamind.ai";
  const workspaceName = session?.workspace?.name ?? "DataMind Production";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/90 px-4 backdrop-blur">
      {/* Left: Workspace dropdown indicator + Search */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
        >
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="font-semibold text-foreground">{workspaceName}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>

        <div className="h-4 w-px bg-border/60 hidden sm:block" />

        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
          className="flex items-center gap-2 rounded-lg border border-input/80 bg-surface/50 px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/50 hover:bg-surface hover:text-foreground sm:w-64 justify-between"
          aria-label="Open command palette"
        >
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Search or ask AI…</span>
          </div>
          <kbd className="hidden rounded border border-border bg-muted/80 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Copilot toggle, Theme toggle, Notifications, User Menu */}
      <div className="flex items-center gap-2">
        {/* AI Copilot Pill button */}
        <button
          type="button"
          onClick={toggleCopilot}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all shadow-sm",
            copilotOpen
              ? "bg-primary text-primary-foreground shadow-glow-sm"
              : "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
          )}
          aria-label="Toggle AI Copilot"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>AI Copilot</span>
        </button>

        <ThemeToggle />

        {/* Notifications Bell */}
        <button
          type="button"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
        </button>

        {/* User profile dropdown */}
        <DropdownMenu
          trigger={
            <button
              className="flex items-center gap-2 rounded-full p-0.5 outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="User menu"
            >
              <Avatar name={name} src={session?.user?.image ?? undefined} className="h-8 w-8" />
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-semibold leading-tight text-foreground">{name}</span>
                <span className="text-[10px] text-muted-foreground">Data Scientist</span>
              </div>
            </button>
          }
        >
          <DropdownLabel>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            </div>
          </DropdownLabel>
          <DropdownSeparator />
          <DropdownItem disabled>
            <UserIcon className="h-4 w-4" /> Profile & Settings
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem onClick={() => signOut({ callbackUrl: "/login" })}>
            <LogOut className="h-4 w-4" /> Sign out
          </DropdownItem>
        </DropdownMenu>
      </div>
    </header>
  );
}
