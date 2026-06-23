// Match our DB resorts against skiresort.info slugs harvested from their
// sitemap, BEFORE fetching any per-resort pages. Same-words-different-order
// is common (our `kaprun-kitzsteinhorn-maiskogel` vs their
// `kitzsteinhorn-maiskogel-kaprun`), so we compare by token set, not by
// exact slug equality.
//
// Output a report:
//   - exact: same slug both sides
//   - token-equal: same set of tokens, order differs
//   - token-subset: one slug's tokens are a subset of the other's
//   - jaccard: best fuzzy match by Jaccard similarity over token sets (>=0.5)
//   - no-match
//
// Writes data/skiresort-matches.json so we can review before backfilling.
//
// Usage: bun scripts/match-skiresort-slugs.ts

import { config } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";

config({ path: ".env.local" });

type OurResort = { id: string; slug: string; name: string; country: string };
type Match = {
  resortId: string;
  ourSlug: string;
  ourName: string;
  country: string;
  theirSlug: string | null;
  method: "exact" | "token-equal" | "token-subset" | "jaccard" | null;
  score: number | null;
};

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const ours = (await sql<OurResort[]>`
  SELECT id, slug, name, country FROM resorts
`) as OurResort[];
await sql.end();

const theirs: string[] = JSON.parse(await readFile("data/skiresort-slugs.json", "utf8"));

function tokens(slug: string): Set<string> {
  return new Set(slug.split("-").filter(Boolean));
}

// Index theirs by token-set fingerprint (sorted tokens joined) → list of slugs.
const theirByFingerprint = new Map<string, string[]>();
const theirTokens: { slug: string; tokens: Set<string> }[] = [];
for (const t of theirs) {
  const tks = tokens(t);
  theirTokens.push({ slug: t, tokens: tks });
  const fp = [...tks].sort().join("-");
  const arr = theirByFingerprint.get(fp) ?? [];
  arr.push(t);
  theirByFingerprint.set(fp, arr);
}
const theirSet = new Set(theirs);

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const matches: Match[] = [];
for (const r of ours) {
  const ourTks = tokens(r.slug);
  const ourFp = [...ourTks].sort().join("-");

  // Tier 1: exact slug
  if (theirSet.has(r.slug)) {
    matches.push({
      resortId: r.id, ourSlug: r.slug, ourName: r.name, country: r.country,
      theirSlug: r.slug, method: "exact", score: 1,
    });
    continue;
  }

  // Tier 2: same token-set (different order)
  const equalMatches = theirByFingerprint.get(ourFp);
  if (equalMatches && equalMatches.length > 0) {
    matches.push({
      resortId: r.id, ourSlug: r.slug, ourName: r.name, country: r.country,
      theirSlug: equalMatches[0], method: "token-equal", score: 1,
    });
    continue;
  }

  // Tier 3 + 4: token-subset or best jaccard. Scan all of theirs; 6800 * 3164
  // is ~21M comparisons but each is a tiny set op (sets ≤ ~6 tokens), so it's
  // fine for a one-off script.
  let best: { slug: string; score: number; method: Match["method"] } | null = null;
  for (const t of theirTokens) {
    if (t.tokens.size === 0) continue;
    const isSubset =
      ourTks.size <= t.tokens.size
        ? [...ourTks].every((x) => t.tokens.has(x))
        : [...t.tokens].every((x) => ourTks.has(x));
    const score = jaccard(ourTks, t.tokens);
    if (isSubset && (!best || score > best.score)) {
      best = { slug: t.slug, score, method: "token-subset" };
    } else if (!isSubset && score >= 0.5 && (!best || score > best.score)) {
      best = { slug: t.slug, score, method: "jaccard" };
    }
  }

  if (best) {
    matches.push({
      resortId: r.id, ourSlug: r.slug, ourName: r.name, country: r.country,
      theirSlug: best.slug, method: best.method, score: best.score,
    });
  } else {
    matches.push({
      resortId: r.id, ourSlug: r.slug, ourName: r.name, country: r.country,
      theirSlug: null, method: null, score: null,
    });
  }
}

const byMethod = matches.reduce<Record<string, number>>((acc, m) => {
  const k = m.method ?? "no-match";
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});

console.log("matches by method:");
for (const [k, v] of Object.entries(byMethod)) {
  console.log(`  ${k.padEnd(14)} ${v}`);
}
console.log(`total ${matches.length} of ${ours.length} resorts`);

await writeFile("data/skiresort-matches.json", JSON.stringify(matches, null, 2));
console.log(`→ data/skiresort-matches.json`);
