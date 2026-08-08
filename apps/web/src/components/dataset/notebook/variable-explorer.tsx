"use client";

/**
 * Variable explorer: a live snapshot of the variables defined by the most
 * recent cell run (name, type, shape, preview). Mirrors the "Variables" pane in
 * Jupyter/VS Code so users can see what's in scope without printing everything.
 */
import { Boxes } from "lucide-react";

import type { NotebookVariable } from "@/lib/types";

export function VariableExplorer({ variables }: { variables: NotebookVariable[] }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
        <Boxes className="h-4 w-4 text-muted-foreground" />
        Variables
        {variables.length > 0 && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {variables.length}
          </span>
        )}
      </div>
      {variables.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">
          Run a cell to capture the variables it defines. They&apos;ll show up
          here with their type, shape and a short preview.
        </p>
      ) : (
        <ul className="max-h-[60vh] divide-y overflow-auto scrollbar-thin">
          {variables.map((v) => (
            <li key={v.name} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-sm font-medium" title={v.name}>
                  {v.name}
                </span>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {v.type}
                  {v.shape ? ` · ${v.shape}` : ""}
                </span>
              </div>
              {v.preview && (
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={v.preview}>
                  {v.preview}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
