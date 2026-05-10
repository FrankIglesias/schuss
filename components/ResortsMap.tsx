"use client";
import { useEffect, useRef } from "react";
import maplibregl, { NavigationControl } from "maplibre-gl";
import { useRouter } from "next/navigation";
import type { ResortIndexEntry } from "@/lib/types";

const STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

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
      properties: { slug: r.slug, name: r.name, country: r.country },
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
          "circle-color": "#22c55e",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3, 10, 6, 14, 9],
          "circle-stroke-color": "#0b1220",
          "circle-stroke-width": 1.5,
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

      map.on("click", "resorts-points", (e) => {
        const feature = e.features?.[0] as GeoJSON.Feature | undefined;
        const props = feature?.properties as { slug?: string } | undefined;
        const slug = props?.slug;
        if (typeof slug === "string") router.push(`/resort/${slug}`);
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
