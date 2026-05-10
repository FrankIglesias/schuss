import type maplibregl from "maplibre-gl";
import { computeBbox, flattenLineCoords, measureLine } from "./measure";
import type { LiftSummary } from "./types";

const LIFTS_CASING = "lifts-casing";
const LIFTS_LINE = "lifts-line";

type EnrichResult = {
  fc: GeoJSON.FeatureCollection;
  summaries: LiftSummary[];
};

export function enrichLifts(
  raw: GeoJSON.FeatureCollection,
  bboxes: Map<string, [number, number, number, number]>,
  startId: number,
): EnrichResult {
  const summaries: LiftSummary[] = [];
  let id = startId;
  const features = raw.features
    .filter(
      (f) =>
        f.geometry.type === "LineString" || f.geometry.type === "MultiLineString",
    )
    .map((f) => {
      const coords = flattenLineCoords(f.geometry);
      const m = measureLine(coords);
      const featureId = `lift-${id++}`;
      const bbox = computeBbox(coords);
      bboxes.set(featureId, bbox);
      summaries.push({
        id: featureId,
        name: (f.properties?.name as string | null) || "Unnamed lift",
        liftType: (f.properties?.liftType as string) ?? "lift",
        lengthM: m.length,
        dropM: m.drop ?? 0,
        bbox,
      });
      return {
        ...f,
        id: featureId,
        properties: {
          ...(f.properties ?? {}),
          id: featureId,
          lengthM: m.length,
          dropM: m.drop ?? 0,
        },
      };
    });
  return { fc: { type: "FeatureCollection", features }, summaries };
}

/** Add the source + casing + dashed-line layers for lifts. */
export function addLiftsLayers(map: maplibregl.Map, fc: GeoJSON.FeatureCollection): void {
  map.addSource("lifts", { type: "geojson", data: fc });
  map.addLayer({
    id: LIFTS_CASING,
    type: "line",
    source: "lifts",
    paint: {
      "line-color": "#020617",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 14, 3, 16, 4],
      "line-opacity": 0.9,
      "line-blur": 1.5,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: LIFTS_LINE,
    type: "line",
    source: "lifts",
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 14, 1.4, 16, 2],
      "line-dasharray": [2, 1.5],
      "line-opacity": 1,
    },
    layout: { "line-cap": "butt", "line-join": "round" },
  });
}

/** Toggle visibility of both lift layers (casing + dashed line). */
export function setLiftsVisible(map: maplibregl.Map, visible: boolean): void {
  const v = visible ? "visible" : "none";
  if (map.getLayer(LIFTS_LINE)) map.setLayoutProperty(LIFTS_LINE, "visibility", v);
  if (map.getLayer(LIFTS_CASING)) map.setLayoutProperty(LIFTS_CASING, "visibility", v);
}

export function attachLiftPopup(map: maplibregl.Map, popup: maplibregl.Popup): void {
  map.on("click", LIFTS_LINE, (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const props = f.properties as Record<string, unknown>;
    const name = (props.name as string | null) || "Unnamed lift";
    const liftType = ((props.liftType as string) ?? "lift").replace(/_/g, " ");
    const lengthM = Number(props.lengthM ?? 0);
    const dropM = Number(props.dropM ?? 0);
    const km = (lengthM / 1000).toFixed(lengthM >= 1000 ? 2 : 3);
    const html = `
      <div class="run-popup">
        <div class="run-popup-name">${name.replace(/</g, "&lt;")}</div>
        <div class="run-popup-meta">
          <span class="run-popup-pill" style="background:#475569">${liftType}</span>
          ${lengthM > 0 ? `<span>${km} km</span>` : ""}
          ${dropM > 0 ? `<span>${dropM} m drop</span>` : ""}
        </div>
      </div>
    `;
    popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
  });
  map.on("mouseenter", LIFTS_LINE, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", LIFTS_LINE, () => {
    map.getCanvas().style.cursor = "";
  });
}
