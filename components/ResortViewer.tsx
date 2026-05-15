"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp } from "lucide-react";
import { ResortMap, type ResortMapHandle, type RunSummary, type LiftSummary } from "./ResortMap";
import type { ResortIndexEntry } from "@/lib/types";
import { difficultyColor, difficultyOrder } from "@/lib/difficulty";

type Tab = "map" | "runs" | "lifts";
type RunSortKey = "difficulty" | "length" | "drop" | "name";

const TABS: readonly Tab[] = ["map", "runs", "lifts"] as const;
const isTab = (v: string): v is Tab => (TABS as readonly string[]).includes(v);

function getHashTab(): Tab {
  if (typeof window === "undefined") return "map";
  const h = window.location.hash.slice(1);
  return isTab(h) ? h : "map";
}

function subscribeHash(fn: () => void) {
  window.addEventListener("hashchange", fn);
  window.addEventListener("popstate", fn);
  return () => {
    window.removeEventListener("hashchange", fn);
    window.removeEventListener("popstate", fn);
  };
}

export function ResortViewer({ resort }: { resort: ResortIndexEntry }) {
  const tab = useSyncExternalStore(subscribeHash, getHashTab, () => "map" as Tab);
  const setTab = (next: Tab) => {
    const targetHash = next === "map" ? "" : `#${next}`;
    if (typeof window === "undefined" || window.location.hash === targetHash) return;
    const url = window.location.pathname + window.location.search + targetHash;
    window.history.pushState(null, "", url);
    // pushState doesn't fire hashchange — manually notify subscribers.
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [lifts, setLifts] = useState<LiftSummary[]>([]);
  const [runSort, setRunSort] = useState<RunSortKey>("difficulty");
  const mapRef = useRef<ResortMapHandle>(null);

  const sortedRuns = [...runs].sort((a, b) => {
    if (runSort === "length") return b.lengthM - a.lengthM;
    if (runSort === "drop") return b.dropM - a.dropM;
    if (runSort === "name") return a.name.localeCompare(b.name);
    return difficultyOrder(a.difficulty) - difficultyOrder(b.difficulty);
  });
  const sortedLifts = [...lifts].sort((a, b) => a.name.localeCompare(b.name));

  const flyToRun = (id: string) => {
    setTab("map");
    requestAnimationFrame(() => mapRef.current?.flyToRun(id));
  };
  const flyToLift = (id: string) => {
    setTab("map");
    requestAnimationFrame(() => mapRef.current?.flyToLift(id));
  };

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        className="flex items-center w-full border-b border-[color:var(--border)] text-sm"
      >
        {(["map", "runs", "lifts"] as const).map((t) => {
          const isActive = tab === t;
          const label =
            t === "runs" && runs.length > 0
              ? `Runs · ${runs.length}`
              : t === "lifts" && lifts.length > 0
              ? `Lifts · ${lifts.length}`
              : t;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t)}
              className={`relative flex-1 text-center pb-2.5 capitalize font-medium transition-colors ${
                isActive
                  ? "text-[color:var(--foreground)]"
                  : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
              }`}
            >
              {label}
              {isActive && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[color:var(--accent)]" />
              )}
            </button>
          );
        })}
      </div>

      <div hidden={tab !== "map"}>
        <ResortMap ref={mapRef} resort={resort} onRunsLoaded={setRuns} onLiftsLoaded={setLifts} />
      </div>

      {tab === "runs" && (
        <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--card)] overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[color:var(--border)] text-[11px] uppercase tracking-wide text-[color:var(--muted-foreground)]">
            <span className="mr-1">Sort:</span>
            {(["difficulty", "length", "drop", "name"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setRunSort(k)}
                className={`px-2.5 h-6 rounded-full transition ${
                  runSort === k ? "bg-[color:var(--muted)] text-[color:var(--foreground)]" : ""
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          {sortedRuns.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[color:var(--muted-foreground)]">
              No runs available.
            </div>
          ) : (
            <ul className="divide-y divide-[color:var(--border)]">
              {sortedRuns.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => flyToRun(r.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[color:var(--muted)]/40 active:bg-[color:var(--muted)]/60 transition-colors"
                  >
                    <span
                      className="block h-2 w-4 rounded shrink-0"
                      style={{ background: difficultyColor(r.difficulty) }}
                    />
                    <span className="flex-1 min-w-0 truncate font-medium">{r.name}</span>
                    {r.lengthM > 0 && (
                      <span className="shrink-0 text-xs text-[color:var(--muted-foreground)] tabular-nums">
                        {(r.lengthM / 1000).toFixed(r.lengthM >= 1000 ? 1 : 2)} km
                      </span>
                    )}
                    {r.dropM > 0 && (
                      <span className="shrink-0 inline-flex items-center gap-0.5 text-xs text-[color:var(--muted-foreground)] tabular-nums">
                        <ArrowUp className="size-3" /> {r.dropM} m
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "lifts" && (
        <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--card)] overflow-hidden">
          {sortedLifts.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[color:var(--muted-foreground)]">
              No lifts available.
            </div>
          ) : (
            <ul className="divide-y divide-[color:var(--border)]">
              {sortedLifts.map((l) => (
                <li key={l.id}>
                  <button
                    onClick={() => flyToLift(l.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[color:var(--muted)]/40 active:bg-[color:var(--muted)]/60 transition-colors"
                  >
                    <span className="block h-0 w-4 border-t-2 border-dashed border-white/70 shrink-0" />
                    <span className="flex-1 min-w-0 truncate font-medium">{l.name}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-[color:var(--muted-foreground)]">
                      {l.liftType.replace(/_/g, " ")}
                    </span>
                    {l.lengthM > 0 && (
                      <span className="shrink-0 text-xs text-[color:var(--muted-foreground)] tabular-nums">
                        {(l.lengthM / 1000).toFixed(l.lengthM >= 1000 ? 1 : 2)} km
                      </span>
                    )}
                    {l.dropM > 0 && (
                      <span className="shrink-0 inline-flex items-center gap-0.5 text-xs text-[color:var(--muted-foreground)] tabular-nums">
                        <ArrowUp className="size-3" /> {l.dropM} m
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
