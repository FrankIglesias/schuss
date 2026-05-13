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
 *   - releases maxBounds in 3D so the tilted camera isn't clamped flat,
 *     restores them in 2D
 * Returns silently if the map has no terrain source (e.g. setup failed).
 */
export function toggleTerrain(
  map: maplibregl.Map,
  on: boolean,
  opts: {
    minZoom: number;
    minZoom3d: number;
    maxBounds2d: [[number, number], [number, number]];
  },
): void {
  // Apply constraints + terrain BEFORE the camera ease. setMaxBounds clamps
  // pitch back toward 0 if not released first; setTerrain triggers a style
  // invalidation that cancels the easeTo animation if called after it.
  map.setMaxBounds(on ? null : opts.maxBounds2d);
  map.setMaxPitch(on ? 80 : 0);
  map.setMinPitch(0);
  map.setMinZoom(on ? opts.minZoom3d : opts.minZoom);
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
  map.easeTo({
    pitch: on ? 60 : 0,
    bearing: on ? -20 : 0,
    zoom: map.getZoom() + (on ? -0.8 : 0.8),
    duration: 700,
    essential: true,
  });
}
