CREATE TABLE "resorts" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"region" text,
	"bbox" jsonb NOT NULL,
	"center" jsonb NOT NULL,
	"elevation_min" real,
	"elevation_max" real,
	"run_km" real,
	"run_count" integer,
	"lift_count" integer,
	"image" text,
	"image_attribution" text,
	"wikidata_id" text,
	CONSTRAINT "resorts_slug_unique" UNIQUE("slug")
);
