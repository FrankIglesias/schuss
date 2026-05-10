import maplibregl, { GeolocateControl } from "maplibre-gl";

/**
 * Mount a GeolocateControl that:
 *   - drops a custom skier emoji marker at the user's location (instead of
 *     maplibre's default blue dot)
 *   - pans the camera to that location while preserving the current zoom
 *
 * The marker auto-removes when tracking ends.
 */
export function attachGeolocate(map: maplibregl.Map): GeolocateControl {
  const control = new GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: false,
    showUserLocation: false,
    fitBoundsOptions: { maxZoom: map.getZoom(), linear: true },
  });

  const skierEl = document.createElement("div");
  skierEl.className = "skier-marker";
  skierEl.textContent = "⛷️";
  let marker: maplibregl.Marker | null = null;

  control.on("geolocate", (raw: unknown) => {
    const pos = raw as GeolocationPosition;
    const lngLat: [number, number] = [pos.coords.longitude, pos.coords.latitude];
    if (!marker) {
      marker = new maplibregl.Marker({ element: skierEl, anchor: "bottom" })
        .setLngLat(lngLat)
        .addTo(map);
    } else {
      marker.setLngLat(lngLat);
    }
    map.easeTo({ center: lngLat, zoom: map.getZoom(), duration: 800 });
  });
  control.on("trackuserlocationend", () => {
    marker?.remove();
    marker = null;
  });

  return control;
}
