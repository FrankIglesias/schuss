"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import maplibregl, { NavigationControl } from "maplibre-gl";
import { Mountain, Layers } from "lucide-react";
import type { Difficulty, ResortIndexEntry } from "@/lib/types";
import { DEFAULT_VISIBLE_DIFFICULTIES, LEGEND_DIFFICULTIES } from "@/lib/difficulty";
import {
  STYLE_URL,
  viewportConstraints,
  setupTerrain,
  toggleTerrain,
  enrichRuns,
  addRunsLayer,
  setRunsFilter,
  attachRunPopup,
  enrichLifts,
  addLiftsLayers,
  setLiftsVisible as setLiftsVisibleLayer,
  attachLiftPopup,
  attachGeolocate,
  type RunSummary,
  type LiftSummary,
} from "@/lib/map";

export type { RunSummary, LiftSummary } from "@/lib/map";

export type ResortMapHandle = {
  flyToRun: (id: string) => void;
  flyToLift: (id: string) => void;
};

type Props = {
  resort: ResortIndexEntry;
  onRunsLoaded?: (runs: RunSummary[]) => void;
  onLiftsLoaded?: (lifts: LiftSummary[]) => void;
  /** When true, the wrapper grows to fill the parent's available height. */
  fill?: boolean;
};

export const ResortMap = forwardRef<ResortMapHandle, Props>(function ResortMap(
  { resort, onRunsLoaded, onLiftsLoaded, fill = false }: Props,
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const constraintsRef = useRef<{
    minZoom: number;
    minZoom3d: number;
    maxBounds2d: [[number, number], [number, number]];
  }>({ minZoom: 11, minZoom3d: 10, maxBounds2d: [[-180, -85], [180, 85]] });
  const featureBboxes = useRef(new Map<string, [number, number, number, number]>());
  const onRunsLoadedRef = useRef(onRunsLoaded);
  onRunsLoadedRef.current = onRunsLoaded;
  const onLiftsLoadedRef = useRef(onLiftsLoaded);
  onLiftsLoadedRef.current = onLiftsLoaded;

  const [is3d, setIs3d] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [visibleDifficulties, setVisibleDifficulties] = useState<Set<Difficulty>>(
    () => new Set(DEFAULT_VISIBLE_DIFFICULTIES),
  );
  const [liftsVisible, setLiftsVisible] = useState(true);
  const [counts, setCounts] = useState<{ runs: Record<string, number>; lifts: number }>({
    runs: {},
    lifts: 0,
  });

  useImperativeHandle(ref, () => ({
    flyToRun: (id) => flyToFeature(id),
    flyToLift: (id) => flyToFeature(id),
  }));

  const flyToFeature = (id: string) => {
    const map = mapRef.current;
    const bbox = featureBboxes.current.get(id);
    if (!map || !bbox) return;
    const [w, s, e, n] = bbox;
    map.fitBounds([[w, s], [e, n]], { padding: 80, duration: 800, maxZoom: 16 });
  };

  const toggleDifficulty = (key: Difficulty) => {
    setVisibleDifficulties((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (mapRef.current) setRunsFilter(mapRef.current, [...next]);
      return next;
    });
  };

  const toggleLifts = () => {
    setLiftsVisible((prev) => {
      const next = !prev;
      if (mapRef.current) setLiftsVisibleLayer(mapRef.current, next);
      return next;
    });
  };

  const toggle3d = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !is3d;
    setIs3d(next);
    toggleTerrain(map, next, constraintsRef.current);
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const constraints = viewportConstraints(resort.bbox);
    constraintsRef.current = {
      minZoom: constraints.minZoom,
      minZoom3d: constraints.minZoom3d,
      maxBounds2d: constraints.maxBounds,
    };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: resort.center,
      zoom: 12.2,
      pitch: 0,
      bearing: 0,
      minZoom: constraints.minZoom,
      maxZoom: 17,
      maxBounds: constraints.maxBounds,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(attachGeolocate(map), "top-right");

    map.on("error", (e) => {
      console.error("[map error]", e?.error ?? e);
    });

    map.on("load", () => {
      setLoaded(true);
      try {
        setupTerrain(map);
      } catch (err) {
        console.error("[terrain setup failed]", err);
      }

      void (async () => {
        try {
          const base = process.env.NEXT_PUBLIC_BLOB_BASE_URL ?? "";
          const res = await fetch(`${base}/resorts/${resort.slug}.json`);
          if (!res.ok) return;
          const data = (await res.json()) as {
            runs: GeoJSON.FeatureCollection;
            lifts: GeoJSON.FeatureCollection;
          };

          const runs = enrichRuns(data.runs, featureBboxes.current, 0);
          const lifts = enrichLifts(data.lifts, featureBboxes.current, runs.fc.features.length);

          const runCounts: Record<string, number> = {};
          for (const f of runs.fc.features) {
            const d = (f.properties?.difficulty as string | undefined) ?? "other";
            runCounts[d] = (runCounts[d] ?? 0) + 1;
          }
          setCounts({ runs: runCounts, lifts: lifts.fc.features.length });

          addRunsLayer(map, runs.fc);
          addLiftsLayers(map, lifts.fc);

          const runPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 12 });
          attachRunPopup(map, runPopup);
          const liftPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 12 });
          attachLiftPopup(map, liftPopup);

          onRunsLoadedRef.current?.(runs.summaries);
          onLiftsLoadedRef.current?.(lifts.summaries);

          const [w, s, e, n] = resort.bbox;
          map.fitBounds([[w, s], [e, n]], { padding: 60, duration: 1200 });
        } catch (err) {
          console.error("[map piste/lift load failed]", err);
        }
      })();
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [resort]);

  return (
    <div className={`flex flex-col gap-3 ${fill ? "h-full min-h-0" : ""}`}>
      <div
        className={`relative w-full overflow-hidden rounded-3xl border border-[color:var(--border)] shadow-xl ${
          fill ? "flex-1 min-h-0" : ""
        }`}
        style={fill ? undefined : { height: "70dvh", minHeight: 480 }}
      >
        <div ref={containerRef} className="absolute inset-0 h-full w-full" />

        {/* 2D / 3D toggle */}
        <div className="absolute left-3 top-3 flex flex-col gap-2">
          <button
            onClick={toggle3d}
            className="inline-flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur text-white text-xs font-semibold px-3 h-9 shadow-lg active:scale-95 transition"
          >
            {is3d ? <Layers className="size-4" /> : <Mountain className="size-4" />}
            {is3d ? "2D" : "3D"}
          </button>
        </div>

        {!loaded && (
          <div className="absolute inset-0 grid place-items-center bg-[color:var(--background)]/60 backdrop-blur-sm">
            <div className="size-8 rounded-full border-2 border-[color:var(--accent)] border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      {/* Legend / piste filter — below the map */}
      <div className="w-full rounded-2xl bg-[color:var(--card)] border border-[color:var(--border)] px-3 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {LEGEND_DIFFICULTIES.map(({ key, label, color }) => {
            const active = visibleDifficulties.has(key);
            const count =
              key === "easy"
                ? (counts.runs.easy ?? 0) + (counts.runs.novice ?? 0)
                : counts.runs[key] ?? 0;
            return (
              <button
                key={key}
                onClick={() => toggleDifficulty(key)}
                className={`inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-medium transition active:scale-95 ${
                  active
                    ? "bg-white/10 text-white"
                    : "bg-white/5 text-white/50 opacity-70"
                }`}
              >
                <span className="block h-2 w-4 rounded" style={{ background: color }} />
                <span>{label}</span>
                {count > 0 && <span className="opacity-70 tabular-nums">{count}</span>}
              </button>
            );
          })}
          <button
            onClick={toggleLifts}
            className={`inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-medium transition active:scale-95 ${
              liftsVisible ? "bg-white/10 text-white" : "bg-white/5 text-white/50 opacity-70"
            }`}
          >
            <span
              className="block h-0 w-4 border-t border-dashed border-current"
              style={{ borderTopWidth: 2 }}
            />
            <span>Lifts</span>
            {counts.lifts > 0 && <span className="opacity-70 tabular-nums">{counts.lifts}</span>}
          </button>
        </div>
      </div>
    </div>
  );
});
