"use client";

/**
 * Parameter form for a cleaning operation. Renders the operation's declared
 * params (select/text/number/columns) with support for conditional `when`
 * visibility, then hands the collected params back to the caller to apply.
 */
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CleaningOperation, CleaningOpParam } from "@/lib/types";

function shouldShow(param: CleaningOpParam, values: Record<string, unknown>): boolean {
  if (!param.when) return true;
  return Object.entries(param.when).every(([k, v]) => String(values[k] ?? "") === v);
}

function defaultsFor(op: CleaningOperation): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of op.params) {
    if (p.type === "select" && p.options?.length) out[p.name] = p.options[0];
    else if (p.type === "columns") out[p.name] = [];
    else out[p.name] = "";
  }
  return out;
}

export function OperationDialog({
  operation,
  column,
  columns,
  open,
  onOpenChange,
  onApply,
  pending,
}: {
  operation: CleaningOperation | null;
  column?: string | null;
  columns: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (params: Record<string, unknown>) => void;
  pending?: boolean;
}) {
  const [values, setValues] = React.useState<Record<string, unknown>>({});

  React.useEffect(() => {
    if (operation && open) setValues(defaultsFor(operation));
  }, [operation, open]);

  if (!operation) return null;

  const set = (name: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const visibleParams = operation.params.filter((p) => shouldShow(p, values));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={operation.label}
      description={
        column ? `Applies to column "${column}".` : "Applies to the whole dataset."
      }
    >
      <div className="space-y-4">
        {visibleParams.length === 0 && (
          <p className="text-sm text-muted-foreground">
            This operation takes no options. Apply it to continue.
          </p>
        )}

        {visibleParams.map((param) => (
          <div key={param.name} className="space-y-1.5">
            <Label className="capitalize" htmlFor={`param-${param.name}`}>
              {param.name.replace(/_/g, " ")}
            </Label>

            {param.type === "select" && (
              <select
                id={`param-${param.name}`}
                value={String(values[param.name] ?? "")}
                onChange={(e) => set(param.name, e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm capitalize shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {param.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            )}

            {param.type === "text" && (
              <Input
                id={`param-${param.name}`}
                value={String(values[param.name] ?? "")}
                onChange={(e) => set(param.name, e.target.value)}
              />
            )}

            {param.type === "number" && (
              <Input
                id={`param-${param.name}`}
                type="number"
                value={String(values[param.name] ?? "")}
                onChange={(e) => set(param.name, e.target.value)}
              />
            )}

            {param.type === "columns" && (
              <div className="max-h-40 space-y-1 overflow-auto rounded-md border p-2">
                {columns.map((col) => {
                  const selected = Array.isArray(values[param.name])
                    ? (values[param.name] as string[])
                    : [];
                  const checked = selected.includes(col);
                  return (
                    <label
                      key={col}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          set(
                            param.name,
                            e.target.checked
                              ? [...selected, col]
                              : selected.filter((c) => c !== col),
                          )
                        }
                      />
                      {col}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onApply(coerce(operation, values))} disabled={pending}>
            {pending ? "Applying…" : "Apply"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Coerce number-typed params from their string inputs before sending. */
function coerce(
  operation: CleaningOperation,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  for (const p of operation.params) {
    if (p.type === "number" && out[p.name] !== "" && out[p.name] != null) {
      const n = Number(out[p.name]);
      if (!Number.isNaN(n)) out[p.name] = n;
    }
  }
  return out;
}
