// Pull every /ski-resort/<slug>/ URL from skiresort.info sitemaps.
// Output: data/skiresort-slugs.json — a sorted, deduped string array.
//
// Usage: bun scripts/harvest-skiresort-slugs.ts

import { writeFile } from "node:fs/promises";

const INDEX = "https://www.skiresort.info/sitemapindex_en.xml";
const USER_AGENT =
  "Mozilla/5.0 (compatible; SchussETL/0.1; +https://github.com/) ski-resort-explorer";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

const indexXml = await fetchText(INDEX);
const sitemapUrls = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
console.log(`→ ${sitemapUrls.length} sitemaps in index`);

const slugs = new Set<string>();
for (const sm of sitemapUrls) {
  const xml = await fetchText(sm);
  const before = slugs.size;
  for (const m of xml.matchAll(/\/ski-resort\/([a-z0-9-]+)\//g)) {
    slugs.add(m[1]);
  }
  console.log(`  ${sm.replace(/^.*\//, "")} → +${slugs.size - before}`);
}

const sorted = [...slugs].sort();
await writeFile("data/skiresort-slugs.json", JSON.stringify(sorted, null, 2));
console.log(`✓ ${sorted.length} unique slugs → data/skiresort-slugs.json`);
