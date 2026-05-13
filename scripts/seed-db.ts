import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { resorts, type NewResort } from "../db/schema";

config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

type RawResort = {
  id: string;
  slug: string;
  name: string;
  country: string;
  region?: string;
  bbox: [number, number, number, number];
  center: [number, number];
  elevationMin?: number;
  elevationMax?: number;
  runKm?: number;
  runCount?: number;
  liftCount?: number;
  image?: string;
  imageAttribution?: string;
  wikidataID?: string | null;
};

const raw = JSON.parse(await readFile("resorts.json", "utf8")) as RawResort[];

const rows: NewResort[] = raw.map((r) => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  country: r.country,
  region: r.region ?? null,
  bbox: r.bbox,
  center: r.center,
  elevationMin: r.elevationMin ?? null,
  elevationMax: r.elevationMax ?? null,
  runKm: r.runKm ?? null,
  runCount: r.runCount ?? null,
  liftCount: r.liftCount ?? null,
  image: r.image ?? null,
  imageAttribution: r.imageAttribution ?? null,
  wikidataId: r.wikidataID ?? null,
}));

console.log(`Inserting ${rows.length} resorts...`);

const chunkSize = 500;
for (let i = 0; i < rows.length; i += chunkSize) {
  const chunk = rows.slice(i, i + chunkSize);
  await db.insert(resorts).values(chunk).onConflictDoNothing();
  console.log(`  ${Math.min(i + chunkSize, rows.length)} / ${rows.length}`);
}

console.log("Done.");
