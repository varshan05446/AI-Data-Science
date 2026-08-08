/**
 * Shared chart style tokens. Palette ids mirror the backend catalog
 * (services/api/.../viz/catalog.py) so a palette chosen in the customization
 * panel resolves to the same colors here.
 */
export const PALETTES: Record<string, string[]> = {
  indigo: ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#10b981", "#3b82f6"],
  ocean: ["#0ea5e9", "#06b6d4", "#3b82f6", "#6366f1", "#0891b2", "#2563eb", "#0284c7", "#4f46e5"],
  sunset: ["#f97316", "#ef4444", "#ec4899", "#f59e0b", "#e11d48", "#fb923c", "#db2777", "#facc15"],
  forest: ["#16a34a", "#10b981", "#84cc16", "#22c55e", "#059669", "#65a30d", "#15803d", "#4ade80"],
  berry: ["#8b5cf6", "#d946ef", "#ec4899", "#a855f7", "#c026d3", "#7c3aed", "#db2777", "#e879f9"],
  mono: ["#334155", "#475569", "#64748b", "#94a3b8", "#0f172a", "#1e293b", "#cbd5e1", "#7c8ba1"],
};

export const DEFAULT_PALETTE = PALETTES.indigo;

export function paletteFor(id?: unknown): string[] {
  if (typeof id === "string" && PALETTES[id]) return PALETTES[id];
  return DEFAULT_PALETTE;
}
