/** Great-circle distance between two [lon, lat] points, in meters. */
export function haversine(a: number[], b: number[]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Total polyline length and elevation drop (max - min Z). */
export function measureLine(coords: number[][]): { length: number; drop: number | null } {
  let length = 0;
  let minEl = Infinity;
  let maxEl = -Infinity;
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    const el = c[2];
    if (typeof el === "number" && Number.isFinite(el)) {
      if (el < minEl) minEl = el;
      if (el > maxEl) maxEl = el;
    }
    if (i > 0) length += haversine(coords[i - 1], c);
  }
  return {
    length: Math.round(length),
    drop: minEl !== Infinity && maxEl !== -Infinity ? Math.round(maxEl - minEl) : null,
  };
}

/** Axis-aligned bbox [w, s, e, n] of a coordinate sequence. */
export function computeBbox(coords: number[][]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const c of coords) {
    if (c[0] < w) w = c[0];
    if (c[0] > e) e = c[0];
    if (c[1] < s) s = c[1];
    if (c[1] > n) n = c[1];
  }
  return [w, s, e, n];
}

/** Flatten a LineString or MultiLineString feature's coordinates. */
export function flattenLineCoords(
  geom: GeoJSON.Geometry,
): number[][] {
  if (geom.type === "LineString") return geom.coordinates;
  if (geom.type === "MultiLineString") return geom.coordinates.flat();
  return [];
}
