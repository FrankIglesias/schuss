// Refresh resort_conditions for every resort with a non-null skiresort_uid.
// Used manually for now; this is the same code path the future Vercel Cron
// route handler will call.
//
// Usage:
//   bun scripts/refresh-all-conditions.ts
//   bun scripts/refresh-all-conditions.ts --limit 50    # smoke test

import { config } from "dotenv";
config({ path: ".env.local" });

import { isNotNull } from "drizzle-orm";
import { db } from "../db";
import { resorts } from "../db/schema";
import { scrape } from "../lib/conditions/scrape";
import { upsertResortConditions } from "../lib/conditions/mutations";

const CONCURRENCY = 6;
const POLITE_DELAY_MS = 200;

const limit = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? Number(process.argv[i + 1]) : Infinity;
})();

const targets = (
  await db
    .select({ id: resorts.id, name: resorts.name, uid: resorts.skiresortUid })
    .from(resorts)
    .where(isNotNull(resorts.skiresortUid))
).slice(0, limit);

console.log(`→ ${targets.length} resorts to refresh (concurrency=${CONCURRENCY})`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cursor = 0;
let done = 0;
let okCount = 0;
let failCount = 0;
const failures: { id: string; name: string; uid: number; error: string }[] = [];

async function worker() {
  while (cursor < targets.length) {
    const i = cursor++;
    const t = targets[i];
    try {
      const data = await scrape({ uid: t.uid! });
      await upsertResortConditions({
        resortId: t.id,
        openStatus: data.openStatus,
        liftsOpen: data.liftsOpen,
        liftsTotal: data.liftsTotal,
        slopesOpenKm: data.slopesOpenKm,
        slopesTotalKm: data.slopesTotalKm,
        snowDepthTopCm: data.snowDepthTopCm,
        snowDepthBaseCm: data.snowDepthBaseCm,
        sourceUrl: data.teaserUrl,
      });
      okCount++;
    } catch (e) {
      failCount++;
      failures.push({
        id: t.id,
        name: t.name,
        uid: t.uid!,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    done++;
    if (done % 100 === 0) console.log(`  ${done}/${targets.length}`);
    await sleep(POLITE_DELAY_MS);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\n✓ ok ${okCount}   ✗ failed ${failCount}`);
if (failures.length > 0) {
  console.log("\nfirst few failures:");
  for (const f of failures.slice(0, 10)) {
    console.log(`  uid=${f.uid}  ${f.name}: ${f.error}`);
  }
}
process.exit(0);
