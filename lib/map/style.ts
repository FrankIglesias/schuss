/** Carto Dark Matter — known-compatible with maplibre-gl 4.x and 5.x. */
export const STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/**
 * Compute pan/zoom limits from a resort's bbox so the user can't drift far
 * from the area or zoom out past country level.
 */
export function viewportConstraints(bbox: [number, number, number, number]): {
  maxBounds: [[number, number], [number, number]];
  minZoom: number;
  minZoom3d: number;
} {
  const [w, s, e, n] = bbox;
  const dx = (e - w) * 0.6;
  const dy = (n - s) * 0.6;
  const span = Math.max(e - w, (n - s) * 1.5);
  const baseMinZoom = Math.max(6, Math.min(11, Math.log2(360 / span) - 2.5));
  return {
    maxBounds: [
      [w - dx, s - dy],
      [e + dx, n + dy],
    ],
    minZoom: baseMinZoom,
    minZoom3d: Math.max(5.5, baseMinZoom - 1),
  };
}
