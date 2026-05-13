import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { resorts as resortsTable, type Resort } from "@/db/schema";
import type { ResortIndexEntry } from "./types";

function toEntry(r: Resort): ResortIndexEntry {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    country: r.country,
    region: r.region ?? undefined,
    bbox: r.bbox,
    center: r.center,
    elevationMin: r.elevationMin ?? undefined,
    elevationMax: r.elevationMax ?? undefined,
    runKm: r.runKm ?? undefined,
    runCount: r.runCount ?? undefined,
    liftCount: r.liftCount ?? undefined,
    image: r.image ?? undefined,
    imageAttribution: r.imageAttribution ?? undefined,
    wikidataID: r.wikidataId,
  };
}

export async function getAllResorts(): Promise<ResortIndexEntry[]> {
  const rows = await db.select().from(resortsTable);
  return rows.map(toEntry);
}

// React cache() dedupes within a single request — so generateMetadata and the
// page component share one DB roundtrip per resort.
export const getResortBySlug = cache(
  async (slug: string): Promise<ResortIndexEntry | undefined> => {
    const rows = await db.select().from(resortsTable).where(eq(resortsTable.slug, slug)).limit(1);
    return rows[0] ? toEntry(rows[0]) : undefined;
  },
);
