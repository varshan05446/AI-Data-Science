"use client";

import { usePathname } from "next/navigation";
import * as React from "react";

/**
 * Global Copilot context. Derives the "active dataset" from the URL or
 * localStorage and exposes open/toggle state used by the layout and topbar.
 */
interface CopilotState {
  /** The dataset currently in scope (from URL or last visited). */
  activeDatasetId: string | null;
  /** Whether the copilot panel is expanded (desktop) or sheet shown (mobile). */
  open: boolean;
  toggle: () => void;
  setOpen: (v: boolean) => void;
}

const CopilotContext = React.createContext<CopilotState>({
  activeDatasetId: null,
  open: false,
  toggle: () => {},
  setOpen: () => {},
});

export function useCopilot() {
  return React.useContext(CopilotContext);
}

const STORAGE_KEY = "copilot:activeDataset";

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Hidden by default — the user opens it explicitly from the topbar toggle.
  const [open, setOpen] = React.useState(false);
  // Last-visited dataset id, hydrated from localStorage only after mount so the
  // server and client render identical markup on the first pass.
  const [storedDatasetId, setStoredDatasetId] = React.useState<string | null>(
    null,
  );

  // Route-derived dataset id is deterministic on both server and client.
  const routeDatasetId = React.useMemo(() => {
    const match = pathname.match(/\/datasets\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  // After mount, read/persist the last-visited dataset without affecting SSR.
  React.useEffect(() => {
    if (routeDatasetId) {
      try {
        localStorage.setItem(STORAGE_KEY, routeDatasetId);
      } catch {}
      setStoredDatasetId(routeDatasetId);
      return;
    }
    try {
      setStoredDatasetId(localStorage.getItem(STORAGE_KEY));
    } catch {
      setStoredDatasetId(null);
    }
  }, [routeDatasetId]);

  const activeDatasetId = routeDatasetId ?? storedDatasetId;

  const toggle = React.useCallback(() => setOpen((v) => !v), []);

  const value = React.useMemo(
    () => ({ activeDatasetId, open, toggle, setOpen }),
    [activeDatasetId, open, toggle],
  );

  return (
    <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>
  );
}
