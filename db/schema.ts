import { pgTable, text, real, integer, jsonb } from "drizzle-orm/pg-core";

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
});

export type Resort = typeof resorts.$inferSelect;
export type NewResort = typeof resorts.$inferInsert;
