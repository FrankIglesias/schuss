import type maplibregl from "maplibre-gl";
import { difficultyColor, difficultyMatchExpression } from "@/lib/difficulty";
import { computeBbox, flattenLineCoords, measureLine } from "./measure";
import type { RunSummary } from "./types";

const RUNS_LAYER = "runs-line";
const RUNS_CASING_LAYER = "runs-casing-black";

type EnrichResult = {
  fc: GeoJSON.FeatureCollection;
  summaries: RunSummary[];
};

/**
 * Strip non-line features, attach lengthM/dropM/id properties, and produce
 * a parallel summary list (with bbox cache).
 */
export function enrichRuns(
  raw: GeoJSON.FeatureCollection,
  bboxes: Map<string, [number, number, number, number]>,
  startId: number,
): EnrichResult {
  const summaries: RunSummary[] = [];
  let id = startId;
  const features = raw.features
    .filter(
      (f) =>
        f.geometry.type === "LineString" || f.geometry.type === "MultiLineString",
    )
    .map((f) => {
      const coords = flattenLineCoords(f.geometry);
      const m = measureLine(coords);
      const featureId = `run-${id++}`;
      const bbox = computeBbox(coords);
      bboxes.set(featureId, bbox);
      summaries.push({
        id: featureId,
        name: (f.properties?.name as string | null) || "Unnamed run",
        difficulty: (f.properties?.difficulty as string) ?? "other",
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

/** Add the source + line layer for runs, colored by difficulty. */
export function addRunsLayer(map: maplibregl.Map, fc: GeoJSON.FeatureCollection): void {
  map.addSource("runs", { type: "geojson", data: fc });

  // Casing for "black" pistes only: a wider, slightly blurred white-ish line
  // drawn underneath so the #000 advanced/expert runs read against the dark
  // basemap. Filtered so it doesn't wash out colored runs.
  map.addLayer({
    id: RUNS_CASING_LAYER,
    type: "line",
    source: "runs",
    filter: ["match", ["get", "difficulty"], ["advanced", "expert"], true, false],
    paint: {
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 14, 6, 16, 9],
      "line-color": "#ffffff",
      "line-opacity": 0.35,
      "line-blur": 2.5,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });

  map.addLayer({
    id: RUNS_LAYER,
    type: "line",
    source: "runs",
    paint: {
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 14, 2.6, 16, 4],
      "line-color": difficultyMatchExpression() as maplibregl.DataDrivenPropertyValueSpecification<string>,
      "line-opacity": 0.95,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
}

/**
 * Update the maplibre filter on `runs-line` to only show the given difficulty
 * keys. An empty set hides everything.
 */
export function setRunsFilter(map: maplibregl.Map, allowed: string[]): void {
  if (!map.getLayer(RUNS_LAYER)) return;
  if (allowed.length === 0) {
    map.setFilter(RUNS_LAYER, ["==", ["get", "difficulty"], "__none__"]);
  } else {
    map.setFilter(RUNS_LAYER, ["match", ["get", "difficulty"], allowed, true, false]);
  }
  // Keep the black-casing layer in sync with the main filter so toggling
  // "Advanced" off in the legend hides the halo too.
  if (map.getLayer(RUNS_CASING_LAYER)) {
    const blackAllowed = allowed.filter((k) => k === "advanced" || k === "expert");
    if (blackAllowed.length === 0) {
      map.setFilter(RUNS_CASING_LAYER, ["==", ["get", "difficulty"], "__none__"]);
    } else {
      map.setFilter(
        RUNS_CASING_LAYER,
        ["match", ["get", "difficulty"], blackAllowed, true, false],
      );
    }
  }
}

/** Wire a click → popup on the runs layer, with cursor feedback. */
export function attachRunPopup(map: maplibregl.Map, popup: maplibregl.Popup): void {
  map.on("click", RUNS_LAYER, (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const props = f.properties as Record<string, unknown>;
    const name = (props.name as string | null) || "Unnamed run";
    const difficulty = (props.difficulty as string) ?? "other";
    const lengthM = Number(props.lengthM ?? 0);
    const dropM = Number(props.dropM ?? 0);
    const km = (lengthM / 1000).toFixed(lengthM >= 1000 ? 2 : 3);
    const html = `
      <div class="run-popup">
        <div class="run-popup-name">${name.replace(/</g, "&lt;")}</div>
        <div class="run-popup-meta">
          <span class="run-popup-pill" style="background:${difficultyColor(difficulty)}">${difficulty}</span>
          <span>${km} km</span>
          ${dropM > 0 ? `<span>${dropM} m drop</span>` : ""}
        </div>
      </div>
    `;
    popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
  });
  map.on("mouseenter", RUNS_LAYER, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", RUNS_LAYER, () => {
    map.getCanvas().style.cursor = "";
  });
}
