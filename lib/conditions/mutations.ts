// Conditions mutations. No "server-only" guard: this module is imported by
// CLI scripts (Node/Bun) and by Vercel Cron route handlers (server). The
// "server-only" import would crash the CLI usage.

import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  resortConditions as resortConditionsTable,
  type NewResortConditions,
} from "@/db/schema";

/**
 * Insert or refresh a resort's conditions row. `fetched_at` is bumped to now.
 */
export async function upsertResortConditions(row: NewResortConditions): Promise<void> {
  await db
    .insert(resortConditionsTable)
    .values(row)
    .onConflictDoUpdate({
      target: resortConditionsTable.resortId,
      set: {
        openStatus: row.openStatus,
        liftsOpen: row.liftsOpen,
        liftsTotal: row.liftsTotal,
        slopesOpenKm: row.slopesOpenKm,
        slopesTotalKm: row.slopesTotalKm,
        snowDepthTopCm: row.snowDepthTopCm,
        snowDepthBaseCm: row.snowDepthBaseCm,
        sourceUrl: row.sourceUrl,
        fetchedAt: sql`now()`,
      },
    });
}
