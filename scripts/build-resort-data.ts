/**
 * Build / refresh resort data from OpenSkiMap.
 *
 * Usage:
 *   bun run scripts/build-resort-data.ts                    # all phases
 *   bun run scripts/build-resort-data.ts --geojson          # only re-download
 *                                                           # and rewrite per-resort files
 *   bun run scripts/build-resort-data.ts --index            # only rebuild
 *                                                           # resorts.json (from sources)
 *   bun run scripts/build-resort-data.ts --images           # only fill missing images
 *   bun run scripts/build-resort-data.ts --images --refresh # also overwrite existing
 *                                                           # image URLs
 *
 * Phases compose: --geojson --index runs both, in order, sharing memory.
 *
 * GeoJSON phase: downloads OpenSkiMap, splits per-resort into
 *   public/resorts/{slug}.json.
 * Index phase:   writes resorts.json with bbox, center, elevations,
 *   runCount, liftCount, wikidataID — NOT images.
 * Images phase:  reads resorts.json and fills `image` / `imageAttribution`
 *   for entries where they're missing (or all, with --refresh).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { slugify } from "../lib/utils";
import { EUROPE_COUNTRIES } from "../lib/country-flags";
import { DIFFICULTY_KEYS } from "../lib/difficulty";
import type { Difficulty, ResortIndexEntry } from "../lib/types";

const EUROPE_CODES = new Set(Object.keys(EUROPE_COUNTRIES));

const ROOT = resolve(import.meta.dir, "..");
const PUBLIC_DIR = resolve(ROOT, "public", "resorts");
const INDEX_PATH = resolve(ROOT, "resorts.json");

const SOURCES = {
  skiAreas: "https://tiles.openskimap.org/geojson/ski_areas.geojson",
  runs: "https://tiles.openskimap.org/geojson/runs.geojson",
  lifts: "https://tiles.openskimap.org/geojson/lifts.geojson",
};

const UA = "schuss/0.1 (francisco@tree-nation.com)";
const IMAGE_CONCURRENCY = 4;
const IMAGE_SLEEP_MS = 100;

type FeatureLike = {
  type: "Feature";
  id?: string;
  properties: Record<string, unknown>;
  geometry: GeoJSON.Geometry;
};

// ────────────────────────────────────────────────────────────── helpers ──

async function fetchJson(url: string) {
  console.log(`Fetching ${url}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

function difficultyOf(props: Record<string, unknown>): Difficulty {
  const d = String(props.difficulty ?? props.piste_difficulty ?? "other").toLowerCase();
  return (DIFFICULTY_KEYS as string[]).includes(d) ? (d as Difficulty) : "other";
}

type Place = {
  iso3166_1Alpha2?: string;
  localized?: { en?: { country?: string; region?: string } };
};

function placeOf(props: Record<string, unknown>): Place | undefined {
  const places = props.places as Place[] | undefined;
  if (places && places.length > 0) return places[0];
  return props.location as Place | undefined;
}

function isEuropean(props: Record<string, unknown>): boolean {
  const cc = placeOf(props)?.iso3166_1Alpha2;
  return !!cc && EUROPE_CODES.has(cc);
}

function bboxOf(features: FeatureLike[]): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  let any = false;
  const visit = (coord: number[]) => {
    const [lon, lat] = coord;
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      any = true;
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  };
  const walk = (g: GeoJSON.Geometry) => {
    if (g.type === "Point") visit(g.coordinates as number[]);
    else if (g.type === "LineString" || g.type === "MultiPoint") (g.coordinates as number[][]).forEach(visit);
    else if (g.type === "Polygon" || g.type === "MultiLineString") (g.coordinates as number[][][]).forEach((r) => r.forEach(visit));
    else if (g.type === "MultiPolygon") (g.coordinates as number[][][][]).forEach((p) => p.forEach((r) => r.forEach(visit)));
  };
  for (const f of features) walk(f.geometry);
  return any ? [w, s, e, n] : null;
}

async function fetchWikidataImage(
  name: string,
  wikidataID: string | null,
): Promise<{ url: string; attribution: string } | null> {
  if (wikidataID) {
    try {
      const sparql = `SELECT ?image WHERE { wd:${wikidataID} wdt:P18 ?image. } LIMIT 1`;
      const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
      });
      if (res.ok) {
        const data = await res.json();
        const img = data?.results?.bindings?.[0]?.image?.value;
        if (img) return { url: img, attribution: "Wikidata / Wikimedia Commons" };
      }
    } catch {}
  }
  try {
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
    const res = await fetch(summaryUrl, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const data = await res.json();
      if (data?.originalimage?.source) return { url: data.originalimage.source, attribution: "Wikipedia" };
      if (data?.thumbnail?.source) return { url: data.thumbnail.source, attribution: "Wikipedia" };
    }
  } catch {}
  return null;
}

function sumRunKm(stats: Record<string, unknown> | undefined): number | undefined {
  const byActivity = (stats?.runs as { byActivity?: Record<string, { byDifficulty?: Record<string, { lengthInKm?: number }> }> } | undefined)?.byActivity;
  if (!byActivity) return undefined;
  let total = 0;
  for (const activity of Object.values(byActivity)) {
    for (const diff of Object.values(activity.byDifficulty ?? {})) {
      if (typeof diff.lengthInKm === "number") total += diff.lengthInKm;
    }
  }
  return total > 0 ? Math.round(total) : undefined;
}

function sumLiftCount(stats: Record<string, unknown> | undefined): number | undefined {
  const byType = (stats?.lifts as { byType?: Record<string, { count?: number }> } | undefined)?.byType;
  if (!byType) return undefined;
  let total = 0;
  for (const t of Object.values(byType)) {
    if (typeof t.count === "number") total += t.count;
  }
  return total > 0 ? total : undefined;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function makeProgressLogger(total: number, getExtra: () => string = () => "") {
  let processed = 0;
  const startedAt = Date.now();
  const render = (label: string) => {
    const width = 30;
    const ratio = total === 0 ? 1 : processed / total;
    const filled = Math.round(ratio * width);
    const bar = "█".repeat(filled) + "░".repeat(width - filled);
    const pct = (ratio * 100).toFixed(1).padStart(5);
    const elapsed = (Date.now() - startedAt) / 1000;
    const eta = processed > 0 ? (elapsed / processed) * (total - processed) : 0;
    const fmt = (s: number) => `${Math.floor(s / 60)}m${Math.floor(s % 60).toString().padStart(2, "0")}s`;
    const extra = getExtra();
    const line = `[${bar}] ${pct}% ${processed}/${total}${extra ? ` · ${extra}` : ""} · ${fmt(elapsed)} elapsed · ETA ${fmt(eta)} · ${label}`;
    process.stdout.write(`\r${line.padEnd(120).slice(0, 120)}`);
  };
  return {
    tick(label = "") {
      processed++;
      render(label);
    },
    setLabel: render,
    finish() {
      process.stdout.write("\n");
    },
  };
}

// ────────────────────────────────────────────────────── shared output ──

/**
 * In-memory product of the GeoJSON phase that the index phase needs
 * (besides the per-resort files written to disk).
 */
type PerArea = {
  id: string;
  slug: string;
  name: string;
  props: Record<string, unknown>;
  area: FeatureLike;
  runs: FeatureLike[];
  lifts: FeatureLike[];
  runFC: GeoJSON.FeatureCollection;
  liftFC: GeoJSON.FeatureCollection;
};

// ─────────────────────────────────────────────────────── geojson phase ──

async function phaseGeoJSON(): Promise<PerArea[]> {
  await mkdir(PUBLIC_DIR, { recursive: true });

  const [areas, runs, lifts] = await Promise.all([
    fetchJson(SOURCES.skiAreas) as Promise<{ features: FeatureLike[] }>,
    fetchJson(SOURCES.runs) as Promise<{ features: FeatureLike[] }>,
    fetchJson(SOURCES.lifts) as Promise<{ features: FeatureLike[] }>,
  ]);

  const europeAreas = areas.features.filter((f) => isEuropean(f.properties));
  console.log(`European ski areas: ${europeAreas.length} / ${areas.features.length}`);

  const areaById = new Map<string, FeatureLike>();
  for (const a of europeAreas) {
    const id = (a.properties.id as string) ?? a.id;
    if (id) areaById.set(id, a);
  }

  const runsByArea = new Map<string, FeatureLike[]>();
  const liftsByArea = new Map<string, FeatureLike[]>();
  const skiAreaIds = (f: FeatureLike): string[] => {
    const raw = f.properties.skiAreas;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry) => (typeof entry === "string" ? entry : (entry as FeatureLike)?.properties?.id as string | undefined))
      .filter((id): id is string => typeof id === "string");
  };
  const groupBy = (features: FeatureLike[], target: Map<string, FeatureLike[]>) => {
    for (const f of features) {
      for (const id of skiAreaIds(f)) {
        if (!areaById.has(id)) continue;
        (target.get(id) ?? target.set(id, []).get(id)!).push(f);
      }
    }
  };
  groupBy(runs.features, runsByArea);
  groupBy(lifts.features, liftsByArea);

  const usedSlugs = new Set<string>();
  let skippedNameless = 0;
  let skippedEmpty = 0;
  const out: PerArea[] = [];
  const progress = makeProgressLogger(areaById.size);

  for (const [id, area] of areaById) {
    const props = area.properties as Record<string, unknown>;
    const rawName = props.name;
    if (typeof rawName !== "string" || rawName.trim() === "") {
      skippedNameless++;
      progress.tick();
      continue;
    }
    const name = rawName.trim();
    let slug = slugify(name) || id;
    if (usedSlugs.has(slug)) {
      let i = 2;
      while (usedSlugs.has(`${slug}-${i}`)) i++;
      slug = `${slug}-${i}`;
    }
    usedSlugs.add(slug);

    const areaRuns = runsByArea.get(id) ?? [];
    const areaLifts = liftsByArea.get(id) ?? [];
    if (areaRuns.length + areaLifts.length === 0) {
      skippedEmpty++;
      progress.tick();
      continue;
    }

    const runFC: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: areaRuns.map((f) => ({
        ...f,
        properties: {
          name: f.properties.name,
          difficulty: difficultyOf(f.properties),
          ref: f.properties.ref,
        },
      })) as GeoJSON.Feature[],
    };
    const liftFC: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: areaLifts.map((f) => ({
        ...f,
        properties: {
          name: f.properties.name,
          liftType: f.properties.liftType ?? f.properties["aerialway"],
        },
      })) as GeoJSON.Feature[],
    };

    await writeFile(
      resolve(PUBLIC_DIR, `${slug}.json`),
      JSON.stringify({ runs: runFC, lifts: liftFC }),
    );

    out.push({ id, slug, name, props, area, runs: areaRuns, lifts: areaLifts, runFC, liftFC });
    progress.tick(name);
  }
  progress.finish();
  console.log(
    `[geojson] wrote ${out.length} per-resort files (${skippedNameless} unnamed skipped, ${skippedEmpty} empty skipped).`,
  );
  return out;
}

// ───────────────────────────────────────────────────────── index phase ──

function buildIndexEntries(perAreas: PerArea[]): ResortIndexEntry[] {
  const index: ResortIndexEntry[] = [];
  for (const a of perAreas) {
    const place = placeOf(a.props);
    const country = place?.localized?.en?.country ?? "Europe";
    const region = place?.localized?.en?.region;
    const wikidataID = (a.props.wikidataID as string | null | undefined) ?? null;
    const bbox = bboxOf([a.area, ...a.runs, ...a.lifts]);
    if (!bbox) continue;
    const center: [number, number] = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
    const stats = a.props.statistics as Record<string, unknown> | undefined;
    const elevations = (stats ?? {}) as { maxElevation?: number; minElevation?: number };
    index.push({
      id: a.id,
      slug: a.slug,
      name: a.name,
      country,
      region,
      bbox,
      center,
      elevationMin: elevations.minElevation,
      elevationMax: elevations.maxElevation,
      runKm: sumRunKm(stats),
      runCount: a.runFC.features.length,
      liftCount: a.liftFC.features.length || sumLiftCount(stats),
      wikidataID,
    });
  }
  index.sort((a, b) => (b.runKm ?? 0) - (a.runKm ?? 0));
  return index;
}

/**
 * Phase wrapper: rebuild the index. If we have fresh PerAreas in memory
 * (because phaseGeoJSON ran in the same process), use those; otherwise
 * re-fetch sources to derive them.
 */
async function phaseIndex(perAreas?: PerArea[]): Promise<ResortIndexEntry[]> {
  const areas = perAreas ?? (await phaseGeoJSON());
  const fresh = buildIndexEntries(areas);

  // Preserve image fields from any pre-existing index so a standalone
  // --index run doesn't wipe images that the images phase populated.
  const existing = await readIndex().catch(() => []);
  const imageBySlug = new Map(existing.map((e) => [e.slug, { image: e.image, attr: e.imageAttribution }]));
  for (const entry of fresh) {
    const prev = imageBySlug.get(entry.slug);
    if (prev?.image) {
      entry.image = prev.image;
      entry.imageAttribution = prev.attr;
    }
  }

  await writeFile(INDEX_PATH, JSON.stringify(fresh, null, 2));
  console.log(`[index] wrote ${fresh.length} entries.`);
  return fresh;
}

async function readIndex(): Promise<ResortIndexEntry[]> {
  const raw = await readFile(INDEX_PATH, "utf8");
  return JSON.parse(raw) as ResortIndexEntry[];
}

// ──────────────────────────────────────────────────────── images phase ──

async function phaseImages(opts: { refresh: boolean }): Promise<void> {
  const index = await readIndex();
  const todo = index.filter((e) => (opts.refresh || !e.image) && (e.name?.trim() ?? "") !== "");
  console.log(`[images] total: ${index.length} · to process: ${todo.length}${opts.refresh ? " (refresh mode)" : ""}`);

  let found = 0;
  let dirty = 0;
  const progress = makeProgressLogger(todo.length, () => `imgs ${found}`);

  const flush = async () => {
    if (dirty === 0) return;
    await writeFile(INDEX_PATH, JSON.stringify(index, null, 2));
    dirty = 0;
  };

  let cursor = 0;
  const workers = Array.from({ length: IMAGE_CONCURRENCY }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= todo.length) return;
      const entry = todo[i];
      progress.setLabel(`fetching: ${entry.name}`);
      const img = await fetchWikidataImage(entry.name, entry.wikidataID ?? null);
      if (img) {
        entry.image = img.url;
        entry.imageAttribution = img.attribution;
        found++;
        dirty++;
      }
      progress.tick(entry.name);
      if (dirty >= 50) await flush();
      await sleep(IMAGE_SLEEP_MS);
    }
  });

  await Promise.all(workers);
  await flush();
  progress.finish();
  console.log(`[images] found ${found} of ${todo.length}.`);
}

// ────────────────────────────────────────────────────────────── main ──

function parseFlags(argv: string[]) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")).map((a) => a.toLowerCase()));
  const requested = {
    geojson: flags.has("--geojson"),
    index: flags.has("--index"),
    images: flags.has("--images"),
  };
  const refresh = flags.has("--refresh") || flags.has("--refresh-images");
  const allOff = !requested.geojson && !requested.index && !requested.images;
  return {
    runGeoJSON: allOff || requested.geojson,
    runIndex: allOff || requested.index,
    runImages: allOff || requested.images,
    refresh,
  };
}

async function main() {
  const opts = parseFlags(process.argv.slice(2));
  console.log(`Phases: geojson=${opts.runGeoJSON} index=${opts.runIndex} images=${opts.runImages}${opts.refresh ? " (refresh)" : ""}`);

  let perAreas: PerArea[] | undefined;
  if (opts.runGeoJSON) {
    perAreas = await phaseGeoJSON();
  }
  if (opts.runIndex) {
    await phaseIndex(perAreas);
  }
  if (opts.runImages) {
    await phaseImages({ refresh: opts.refresh });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
