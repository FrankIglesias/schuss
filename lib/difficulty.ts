import type { Difficulty } from "./types";

type DifficultyMeta = {
  /** Canonical key used in GeoJSON properties + map expressions. */
  key: Difficulty;
  /** Display label in EU notation. */
  label: string;
  /** Hex color used everywhere (legend, runs lines, list bullets, popup pill). */
  color: string;
  /** Sort weight (lower = beginner-friendly first). */
  order: number;
  /** Whether this difficulty appears in the user-facing legend / sort UI. */
  inLegend: boolean;
};

/**
 * Single source of truth for piste difficulties.
 * Order in this array IS the display order in the legend.
 */
// European 4-tier convention. OSM piste:difficulty values are FIS-aligned,
// so we map them directly to the European colors (green/blue/red/black)
// rather than the 3-tier US scheme. Resorts in NA will look one tier
// "harder" to a US visitor — acceptable, since the source data is European.
export const DIFFICULTIES: DifficultyMeta[] = [
  { key: "novice",       label: "Beginner",     color: "#22c55e", order: 0, inLegend: true  },
  { key: "easy",         label: "Easy",         color: "#3b82f6", order: 1, inLegend: true  },
  { key: "intermediate", label: "Intermediate", color: "#ef4444", order: 2, inLegend: true  },
  // "Black" runs stay pure #000 to match the FIS convention. Visibility on
  // the dark basemap is restored by a casing/halo layer beneath the line
  // (see lib/map/runs.ts) and an inset ring on the legend dot.
  { key: "advanced",     label: "Advanced",     color: "#000000", order: 3, inLegend: true  },
  { key: "expert",       label: "Expert",       color: "#000000", order: 4, inLegend: false },
  { key: "freeride",     label: "Freeride",     color: "#f59e0b", order: 5, inLegend: false },
  { key: "other",        label: "Other",        color: "#94a3b8", order: 6, inLegend: false },
];

/** O(1) lookup by key. */
export const DIFFICULTY_BY_KEY: Record<Difficulty, DifficultyMeta> = Object.fromEntries(
  DIFFICULTIES.map((d) => [d.key, d]),
) as Record<Difficulty, DifficultyMeta>;

/** Visible-in-legend difficulties, in display order. */
export const LEGEND_DIFFICULTIES: DifficultyMeta[] = DIFFICULTIES.filter((d) => d.inLegend);

/** All canonical keys (used by the ETL to validate inbound difficulty strings). */
export const DIFFICULTY_KEYS: Difficulty[] = DIFFICULTIES.map((d) => d.key);

/** Default set of keys treated as "visible" on first render of the legend. */
export const DEFAULT_VISIBLE_DIFFICULTIES = new Set<Difficulty>(
  LEGEND_DIFFICULTIES.map((d) => d.key),
);

/** Convenience for sorting runs by difficulty. */
export function difficultyOrder(key: string): number {
  return DIFFICULTY_BY_KEY[key as Difficulty]?.order ?? 99;
}

/** Convenience for getting a hex color (with safe fallback). */
export function difficultyColor(key: string): string {
  return DIFFICULTY_BY_KEY[key as Difficulty]?.color ?? DIFFICULTY_BY_KEY.other.color;
}

/**
 * MapLibre `["match", ["get", "difficulty"], ...]` color expression
 * built from the table above so the map and the UI stay in lock-step.
 */
export function difficultyMatchExpression(): unknown[] {
  const out: unknown[] = ["match", ["get", "difficulty"]];
  for (const d of DIFFICULTIES) {
    if (d.key === "other") continue; // "other" is the fallback default
    out.push(d.key, d.color);
  }
  out.push(DIFFICULTY_BY_KEY.other.color);
  return out;
}
