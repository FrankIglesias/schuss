import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  resorts as resortsTable,
  resortConditions as resortConditionsTable,
  type ResortConditions,
} from "@/db/schema";

/** Slugs of every resort whose latest conditions row says `open`. Cached per request. */
export const getOpenResortSlugs = cache(async (): Promise<string[]> => {
  const rows = await db
    .select({ slug: resortsTable.slug })
    .from(resortsTable)
    .innerJoin(resortConditionsTable, eq(resortConditionsTable.resortId, resortsTable.id))
    .where(eq(resortConditionsTable.openStatus, "open"));
  return rows.map((r) => r.slug);
});

export const getResortConditions = cache(
  async (resortId: string): Promise<ResortConditions | undefined> => {
    const rows = await db
      .select()
      .from(resortConditionsTable)
      .where(eq(resortConditionsTable.resortId, resortId))
      .limit(1);
    return rows[0];
  },
);
