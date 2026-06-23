import { pgTable, text, real, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const resorts = pgTable("resorts", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  region: text("region"),
  bbox: jsonb("bbox").$type<[number, number, number, number]>().notNull(),
  center: jsonb("center").$type<[number, number]>().notNull(),
  elevationMin: real("elevation_min"),
  elevationMax: real("elevation_max"),
  runKm: real("run_km"),
  runCount: integer("run_count"),
  liftCount: integer("lift_count"),
  image: text("image"),
  imageAttribution: text("image_attribution"),
  wikidataId: text("wikidata_id"),
  // skiresort.info internal numeric id, used as the join key for live
  // conditions. Backfilled by a one-off mapping crawl; nullable until a
  // match is found.
  skiresortUid: integer("skiresort_uid"),
});

export type Resort = typeof resorts.$inferSelect;
export type NewResort = typeof resorts.$inferInsert;

// Live conditions, one row per resort. Upserted on each scrape run.
// Kept separate from `resorts` because the resort row is static OSM-derived
// data while these values change daily.
export const resortConditions = pgTable("resort_conditions", {
  resortId: text("resort_id")
    .primaryKey()
    .references(() => resorts.id, { onDelete: "cascade" }),
  openStatus: text("open_status"), // 'open' | 'closed' | 'partially open'
  liftsOpen: integer("lifts_open"),
  liftsTotal: integer("lifts_total"),
  slopesOpenKm: real("slopes_open_km"),
  slopesTotalKm: real("slopes_total_km"),
  snowDepthTopCm: integer("snow_depth_top_cm"),
  snowDepthBaseCm: integer("snow_depth_base_cm"),
  sourceUrl: text("source_url"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ResortConditions = typeof resortConditions.$inferSelect;
export type NewResortConditions = typeof resortConditions.$inferInsert;
