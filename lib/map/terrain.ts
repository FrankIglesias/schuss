import type maplibregl from "maplibre-gl";

const TERRARIUM_TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];

/**
 * Add a single shared "terrain" raster-DEM source plus a hillshade layer.
 * Hillshade visibility is initially `none` so 2D pages render flat.
 * Call {@link toggleTerrain} to enable/disable terrain tilt + hillshade.
 */
export function setupTerrain(map: maplibregl.Map): void {
  map.addSource("terrain", {
    type: "raster-dem",
    tiles: TERRARIUM_TILES,
    tileSize: 256,
    encoding: "terrarium",
    maxzoom: 15,
    attribution: "Terrain © Mapzen / AWS",
  });
  map.addLayer({
    id: "hillshade-layer",
    type: "hillshade",
    source: "terrain",
    paint: {
      "hillshade-exaggeration": 0.55,
      "hillshade-shadow-color": "#0b1220",
    },
    layout: { visibility: "none" },
  });
}

/**
 * Toggle the 3D terrain on/off:
 *   - flips terrain (DEM) and hillshade visibility
 *   - swaps the camera between flat (pitch 0) and tilted (pitch 60)
 * Returns silently if the map has no terrain source (e.g. setup failed).
 */
export function toggleTerrain(
  map: maplibregl.Map,
  on: boolean,
  opts: { minZoom: number; minZoom3d: number },
): void {
  map.setMaxPitch(on ? 80 : 0);
  map.setMinPitch(0);
  map.setMinZoom(on ? opts.minZoom3d : opts.minZoom);
  map.easeTo({
    pitch: on ? 60 : 0,
    bearing: on ? -20 : 0,
    duration: 700,
  });
  try {
    if (on && map.getSource("terrain")) {
      map.setTerrain({ source: "terrain", exaggeration: 1.4 });
    } else {
      map.setTerrain(null);
    }
    if (map.getLayer("hillshade-layer")) {
      map.setLayoutProperty("hillshade-layer", "visibility", on ? "visible" : "none");
    }
  } catch (err) {
    console.error("[toggleTerrain failed]", err);
  }
}
