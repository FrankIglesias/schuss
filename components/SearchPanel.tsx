"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search as SearchIcon, X, SlidersHorizontal } from "lucide-react";
import { countryFlag } from "@/lib/country-flags";
import type { ResortIndexEntry } from "@/lib/types";

type Filters = {
  countries: Set<string>;
  minRuns: number;
  minElevation: number;
  openOnly: boolean;
};

export function SearchPanel({
  resorts,
  openSlugs,
}: {
  resorts: ResortIndexEntry[];
  openSlugs: string[];
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const openSet = useMemo(() => new Set(openSlugs), [openSlugs]);

  const bounds = useMemo(() => {
    let maxRuns = 0;
    let maxElev = 0;
    const countrySet = new Set<string>();
    for (const r of resorts) {
      if (r.runCount && r.runCount > maxRuns) maxRuns = r.runCount;
      if (r.elevationMax && r.elevationMax > maxElev) maxElev = r.elevationMax;
      countrySet.add(r.country);
    }
    return {
      maxRuns: Math.max(maxRuns, 10),
      maxElev: Math.max(maxElev, 1000),
      countries: [...countrySet].sort(),
    };
  }, [resorts]);

  const [filters, setFilters] = useState<Filters>(() => ({
    countries: new Set<string>(),
    minRuns: 0,
    minElevation: 0,
    openOnly: false,
  }));

  const activeCount =
    (filters.countries.size > 0 ? 1 : 0) +
    (filters.minRuns > 0 ? 1 : 0) +
    (filters.minElevation > 0 ? 1 : 0) +
    (filters.openOnly ? 1 : 0);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return resorts.filter((r) => {
      if (filters.openOnly && !openSet.has(r.slug)) return false;
      if (filters.countries.size > 0 && !filters.countries.has(r.country)) return false;
      const runs = r.runCount ?? 0;
      if (runs < filters.minRuns) return false;
      if (filters.minElevation > 0 && (r.elevationMax ?? 0) < filters.minElevation) return false;
      if (needle) {
        const hay =
          r.name.toLowerCase() +
          " " +
          r.country.toLowerCase() +
          " " +
          (r.region?.toLowerCase() ?? "");
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [resorts, q, filters, openSet]);

  const toggleCountry = (c: string) =>
    setFilters((f) => {
      const next = new Set(f.countries);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return { ...f, countries: next };
    });

  const reset = () =>
    setFilters({
      countries: new Set<string>(),
      minRuns: 0,
      minElevation: 0,
      openOnly: false,
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 rounded-2xl bg-[color:var(--card)] border border-[color:var(--border)] px-4 h-12 shadow-sm">
          <SearchIcon className="size-4 text-[color:var(--muted-foreground)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search resorts, regions, countries…"
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[color:var(--muted-foreground)]"
            inputMode="search"
            autoCorrect="off"
            autoCapitalize="off"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear">
              <X className="size-4 text-[color:var(--muted-foreground)]" />
            </button>
          )}
        </div>
        <button
          onClick={() => setOpen(true)}
          className="relative inline-flex items-center gap-1.5 rounded-2xl bg-[color:var(--card)] border border-[color:var(--border)] px-4 h-12 text-sm font-medium shadow-sm active:scale-95 transition"
          aria-label="Filters"
        >
          <SlidersHorizontal className="size-4" />
          <span>Filters</span>
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 grid place-items-center size-5 text-[10px] font-bold rounded-full bg-[color:var(--accent)] text-white">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      <p className="text-xs text-[color:var(--muted-foreground)]">
        {results.length} {results.length === 1 ? "resort" : "resorts"}
      </p>

      <ul className="space-y-2">
        {results.slice(0, 50).map((r) => (
          <li key={r.slug}>
            <Link
              href={`/resort/${r.slug}`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--card)] border border-[color:var(--border)] px-4 py-3 active:scale-[0.99] transition"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{r.name}</div>
                <div className="text-xs text-[color:var(--muted-foreground)] truncate">
                  {r.region ? `${r.region} · ` : ""}
                  {r.country}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {openSet.has(r.slug) ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-0.5">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Open
                  </span>
                ) : null}
                {r.runCount ? (
                  <span className="text-xs rounded-full bg-[color:var(--muted)] px-2 py-0.5">
                    {r.runCount} pistes
                  </span>
                ) : null}
                {r.elevationMax ? (
                  <span className="text-xs rounded-full bg-[color:var(--muted)] px-2 py-0.5">
                    {r.elevationMax} m
                  </span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-[color:var(--background)] border-t border-[color:var(--border)] shadow-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between px-5 py-4 bg-[color:var(--background)] border-b border-[color:var(--border)]">
              <h2 className="text-lg font-semibold">Filters</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={reset}
                  className="text-sm text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                >
                  Reset
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="grid place-items-center size-9 rounded-full bg-[color:var(--muted)]"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="px-5 py-5 space-y-6">
              <section className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Open now
                  </h3>
                  <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
                    Only resorts currently open · {openSlugs.length} available
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={filters.openOnly}
                  onClick={() => setFilters((f) => ({ ...f, openOnly: !f.openOnly }))}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                    filters.openOnly ? "bg-emerald-500" : "bg-[color:var(--muted)]"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      filters.openOnly ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Min pistes
                  </h3>
                  <span className="text-sm tabular-nums">{filters.minRuns}+</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={bounds.maxRuns}
                  value={filters.minRuns}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, minRuns: Number(e.target.value) }))
                  }
                  className="w-full accent-[color:var(--accent)]"
                />
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Min Elevation
                  </h3>
                  <span className="text-sm tabular-nums">{filters.minElevation} m</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={bounds.maxElev}
                  step={50}
                  value={filters.minElevation}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, minElevation: Number(e.target.value) }))
                  }
                  className="w-full accent-[color:var(--accent)]"
                />
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                  Country
                </h3>
                <div className="flex flex-wrap gap-2">
                  {bounds.countries.map((c) => {
                    const active = filters.countries.has(c);
                    return (
                      <button
                        key={c}
                        onClick={() => toggleCountry(c)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-sm transition active:scale-95 ${
                          active
                            ? "bg-[color:var(--foreground)] text-[color:var(--background)]"
                            : "bg-[color:var(--muted)]/60 text-[color:var(--foreground)]"
                        }`}
                      >
                        {countryFlag(c) && <span aria-hidden>{countryFlag(c)}</span>}
                        <span>{c}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <button
                onClick={() => setOpen(false)}
                className="w-full h-12 rounded-2xl bg-[color:var(--accent)] text-white font-semibold active:scale-[0.99] transition"
              >
                Show {results.length} {results.length === 1 ? "resort" : "resorts"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
