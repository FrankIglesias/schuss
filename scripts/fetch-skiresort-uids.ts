// For each candidate match in data/skiresort-matches.json, fetch the
// /ski-resort/<theirSlug>/ page, extract `data-uid` and the H1 name, then
// verify the page actually corresponds to our resort by checking token
// overlap between the two names. If verified, backfill resorts.skiresort_uid.
//
// Buckets we attempt:
//   exact, token-equal: ALWAYS accepted (the slug match is already strong).
//   token-subset, jaccard: accepted ONLY if name overlap ≥ NAME_THRESHOLD.
//
// Bounded concurrency, retries on 429/5xx, polite delay.
//
// Usage:
//   bun scripts/fetch-skiresort-uids.ts                # full run
//   bun scripts/fetch-skiresort-uids.ts --limit 30     # smoke test
//   bun scripts/fetch-skiresort-uids.ts --dry-run      # parse + verify, don't write

import { config } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";

config({ path: ".env.local" });

const BASE = "https://www.skiresort.info";
const USER_AGENT =
  "Mozilla/5.0 (compatible; SchussETL/0.1; +https://github.com/) ski-resort-explorer";
const CONCURRENCY = 6;
const RETRIES = 3;
const NAME_THRESHOLD = 0.5; // Jaccard over name tokens

type Match = {
  resortId: string;
  ourSlug: string;
  ourName: string;
  country: string;
  theirSlug: string | null;
  method: "exact" | "token-equal" | "token-subset" | "jaccard" | null;
  score: number | null;
};

const args = process.argv.slice(2);
const limit = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();
const dryRun = args.includes("--dry-run");

const matches: Match[] = JSON.parse(
  await readFile("data/skiresort-matches.json", "utf8"),
);

// Only buckets we'll attempt. no-match has no slug to try.
const candidates = matches
  .filter((m) => m.theirSlug && m.method !== null)
  .slice(0, limit);

console.log(`→ ${candidates.length} candidates to fetch (concurrency=${CONCURRENCY})`);

function nameTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

async function fetchWithRetry(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;
      return await res.text();
    } catch {
      await sleep(2000 * (attempt + 1));
    }
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type FetchResult = {
  resortId: string;
  ourName: string;
  theirSlug: string;
  method: Match["method"];
  uid: number | null;
  theirName: string | null;
  nameScore: number | null;
  accepted: boolean;
  reason: string;
};

async function processOne(m: Match): Promise<FetchResult> {
  // The data-uid placeholder lives on the /snow-report/ subpage, not the
  // main resort page. The H1 / breadcrumb name is on both, so this URL
  // gives us everything we need in one fetch.
  const url = `${BASE}/ski-resort/${m.theirSlug}/snow-report/`;
  const html = await fetchWithRetry(url);
  if (!html) {
    return {
      resortId: m.resortId, ourName: m.ourName, theirSlug: m.theirSlug!, method: m.method,
      uid: null, theirName: null, nameScore: null, accepted: false, reason: "fetch-failed",
    };
  }
  // The resort's *own* uid is embedded in an inline console.log, distinct
  // from cross-promo .snowreportLoader widgets that also appear on the page.
  const uidMatch = html.match(/Resort uid:\s*(\d+)/);
  if (!uidMatch) {
    return {
      resortId: m.resortId, ourName: m.ourName, theirSlug: m.theirSlug!, method: m.method,
      uid: null, theirName: null, nameScore: null, accepted: false, reason: "no-uid-on-page",
    };
  }
  const uid = Number(uidMatch[1]);
  // H1 includes "Snow report" prefix on the snow-report page — strip it.
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const theirName = h1
    ? h1[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&#8203;/g, "") // zero-width-space entity
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .replace(/^\s*Snow report\s*/i, "")
        .trim()
    : null;
  const ourTks = nameTokens(m.ourName);
  const theirTks = theirName ? nameTokens(theirName) : new Set<string>();
  // Accept when one name is a token-subset of the other (covers
  // "KitzSki" ⊂ "KitzSki Kitzbühel Kirchberg"). Fall back to jaccard.
  const intersection = [...ourTks].filter((t) => theirTks.has(t)).length;
  const subsetScore = ourTks.size > 0 ? intersection / Math.min(ourTks.size, theirTks.size || 1) : 0;
  const jacc = jaccard(ourTks, theirTks);
  const score = Math.max(subsetScore, jacc);
  const strongBucket = m.method === "exact" || m.method === "token-equal";
  const accepted = strongBucket || score >= NAME_THRESHOLD;
  return {
    resortId: m.resortId, ourName: m.ourName, theirSlug: m.theirSlug!, method: m.method,
    uid, theirName, nameScore: score, accepted,
    reason: accepted ? "ok" : `name-mismatch(${score.toFixed(2)})`,
  };
}

// Bounded-concurrency worker pool.
const results: FetchResult[] = [];
let cursor = 0;
let done = 0;

async function worker() {
  while (cursor < candidates.length) {
    const i = cursor++;
    const r = await processOne(candidates[i]);
    results.push(r);
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${candidates.length}`);
    await sleep(200); // politeness
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const accepted = results.filter((r) => r.accepted && r.uid != null);
const rejected = results.filter((r) => !r.accepted);
const failed = results.filter((r) => r.uid == null);

console.log(`\nresults:`);
console.log(`  accepted    ${accepted.length}`);
console.log(`  rejected    ${rejected.length}`);
console.log(`  fetch failed${failed.length}`);
console.log(`  by method (accepted):`);
const byMethod = accepted.reduce<Record<string, number>>((acc, r) => {
  const k = r.method ?? "?";
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});
for (const [k, v] of Object.entries(byMethod)) console.log(`    ${k.padEnd(14)} ${v}`);

await writeFile(
  "data/skiresort-uid-fetch.json",
  JSON.stringify(results, null, 2),
);
console.log(`→ wrote data/skiresort-uid-fetch.json`);

if (dryRun) {
  console.log("(dry-run, not writing to DB)");
  process.exit(0);
}

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
let updated = 0;
for (const r of accepted) {
  await sql`
    UPDATE resorts SET skiresort_uid = ${r.uid}
    WHERE id = ${r.resortId} AND skiresort_uid IS DISTINCT FROM ${r.uid}
  `;
  updated++;
}
await sql.end();
console.log(`✓ updated ${updated} resorts.skiresort_uid`);
