"use client";
import { useEffect, useRef } from "react";
import maplibregl, { NavigationControl } from "maplibre-gl";
import { useRouter } from "next/navigation";
import { countryFlag } from "@/lib/country-flags";
import { attachGeolocate } from "@/lib/map";
import type { ResortIndexEntry } from "@/lib/types";

const STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

type Props = { resorts: ResortIndexEntry[] };

export function ResortsMap({ resorts }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const features: GeoJSON.Feature<GeoJSON.Point>[] = resorts.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: r.center },
      properties: {
        slug: r.slug,
        name: r.name,
        country: r.country,
        region: r.region ?? "",
        runCount: r.runCount ?? 0,
        liftCount: r.liftCount ?? 0,
        elevationMax: r.elevationMax ?? 0,
      },
    }));
    const fc: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: "FeatureCollection",
      features,
    };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [10, 47],
      zoom: 3.6,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(attachGeolocate(map), "top-right");

    map.on("load", () => {
      map.addSource("resorts", {
        type: "geojson",
        data: fc,
        cluster: true,
        clusterRadius: 45,
        clusterMaxZoom: 11,
      });

      map.addLayer({
        id: "resorts-clusters",
        type: "circle",
        source: "resorts",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#0ea5e9",
            25, "#3b82f6",
            100, "#6366f1",
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            14,
            25, 18,
            100, 24,
          ],
          "circle-stroke-color": "#0b1220",
          "circle-stroke-width": 2,
          "circle-opacity": 0.9,
        },
      });

      map.addLayer({
        id: "resorts-cluster-count",
        type: "symbol",
        source: "resorts",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: "resorts-points",
        type: "circle",
        source: "resorts",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#ffffff",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3, 10, 6, 14, 9],
          "circle-stroke-color": "#0b1220",
          "circle-stroke-width": 1.5,
        },
      });

      map.addLayer({
        id: "resorts-labels",
        type: "symbol",
        source: "resorts",
        filter: ["!", ["has", "point_count"]],
        minzoom: 7,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 7, 11, 12, 14],
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-max-width": 8,
          "text-allow-overlap": false,
          "text-optional": true,
          "text-padding": 4,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#0b1220",
          "text-halo-width": 1.4,
        },
      });

      map.on("click", "resorts-clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["resorts-clusters"] });
        const feature = features[0] as GeoJSON.Feature | undefined;
        const props = feature?.properties as { cluster_id?: number } | undefined;
        const clusterId = typeof props?.cluster_id === "number" ? props.cluster_id : null;
        const source = map.getSource("resorts") as maplibregl.GeoJSONSource | undefined;
        if (clusterId === null || !source || feature?.geometry.type !== "Point") return;
        const center = feature.geometry.coordinates as [number, number];
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({ center, zoom });
        }).catch(() => {});
      });

      const resortPopup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        offset: 14,
        maxWidth: "260px",
      });

      map.on("click", "resorts-points", (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const p = feature.properties as {
          slug: string;
          name: string;
          country: string;
          region: string;
          runCount: number;
          liftCount: number;
          elevationMax: number;
        };
        const flag = countryFlag(p.country);
        const where = [p.region, p.country].filter(Boolean).join(" · ");
        const stats: string[] = [];
        if (p.elevationMax) stats.push(`${Math.round(p.elevationMax)} m`);
        if (p.runCount) stats.push(`${p.runCount} pistes`);
        if (p.liftCount) stats.push(`${p.liftCount} lifts`);
        const html = `
          <div class="resort-popup">
            <div class="resort-popup-name">${escapeHtml(p.name)}</div>
            <div class="resort-popup-where">${flag ? `${flag} ` : ""}${escapeHtml(where)}</div>
            ${stats.length ? `<div class="resort-popup-stats">${stats.join(" · ")}</div>` : ""}
            <button type="button" class="resort-popup-cta" data-slug="${escapeHtml(p.slug)}">View resort →</button>
          </div>
        `;
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        resortPopup
          .setLngLat([lng, lat])
          .setHTML(html)
          .addTo(map);
        const el = resortPopup.getElement();
        const btn = el?.querySelector<HTMLButtonElement>(".resort-popup-cta");
        btn?.addEventListener("click", () => {
          const slug = btn.dataset.slug;
          if (slug) router.push(`/resort/${slug}`);
        }, { once: true });
      });

      const cursorOn = () => (map.getCanvas().style.cursor = "pointer");
      const cursorOff = () => (map.getCanvas().style.cursor = "");
      map.on("mouseenter", "resorts-clusters", cursorOn);
      map.on("mouseleave", "resorts-clusters", cursorOff);
      map.on("mouseenter", "resorts-points", cursorOn);
      map.on("mouseleave", "resorts-points", cursorOff);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [resorts, router]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-3xl border border-[color:var(--border)] shadow-xl"
      style={{ height: "75dvh", minHeight: 520 }}
    >
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
