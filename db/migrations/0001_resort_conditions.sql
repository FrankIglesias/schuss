CREATE TABLE "resort_conditions" (
	"resort_id" text PRIMARY KEY NOT NULL,
	"open_status" text,
	"lifts_open" integer,
	"lifts_total" integer,
	"slopes_open_km" real,
	"slopes_total_km" real,
	"snow_depth_top_cm" integer,
	"snow_depth_base_cm" integer,
	"source_url" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resorts" ADD COLUMN "skiresort_uid" integer;--> statement-breakpoint
ALTER TABLE "resort_conditions" ADD CONSTRAINT "resort_conditions_resort_id_resorts_id_fk" FOREIGN KEY ("resort_id") REFERENCES "public"."resorts"("id") ON DELETE cascade ON UPDATE no action;