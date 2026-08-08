"use client";

/**
 * Shared chart export helpers used by ChartFrame. Kept dependency-free:
 *  - Plotly images are produced via a lazy `import()` of the engine (so it stays
 *    out of the main bundle) and its `toImage`.
 *  - PDF export prints the rendered image (browser "Save as PDF"), avoiding a
 *    heavy PDF library.
 */
import type { Chart } from "@/lib/types";

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadCsv(chart: Chart) {
  const csv = rowsToCsv((chart.data ?? []) as Record<string, unknown>[]);
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${chart.id}.csv`);
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function copyImage(dataUrl: string): Promise<boolean> {
  try {
    const blob = await dataUrlToBlob(dataUrl);
    // ClipboardItem is not in older lib DOM typings; guard at runtime.
    const Item = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (!Item || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new Item({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

export function printPdf(dataUrl: string, title: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  // Build the print document with DOM APIs (no document.write / HTML injection).
  w.document.title = title;
  const style = w.document.createElement("style");
  style.textContent =
    "body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh}img{max-width:100%;max-height:100%}";
  w.document.head.appendChild(style);
  const img = w.document.createElement("img");
  img.src = dataUrl;
  img.onload = () => {
    w.focus();
    w.print();
  };
  w.document.body.appendChild(img);
}

/** Render the currently-mounted Plotly graph within `container` to a data URL. */
export async function plotlyImage(
  container: HTMLElement,
  format: "png" | "svg",
): Promise<string | null> {
  const gd = container.querySelector<HTMLElement>(".js-plotly-plot");
  if (!gd) return null;
  // @ts-expect-error - dist-min ships no bundled types.
  const mod = await import("plotly.js-dist-min");
  const plotly = (mod.default ?? mod) as {
    toImage: (gd: HTMLElement, opts: Record<string, unknown>) => Promise<string>;
  };
  return plotly.toImage(gd, {
    format,
    scale: 2,
    width: gd.clientWidth || 900,
    height: gd.clientHeight || 500,
  });
}
