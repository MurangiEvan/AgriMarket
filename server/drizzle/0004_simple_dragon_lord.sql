UPDATE "categories" SET "name" = 'Fruits' WHERE "slug" = 'fruit';--> statement-breakpoint
INSERT INTO "categories" ("slug", "name", "is_active") VALUES
  ('vegetables', 'Vegetables', true),
  ('fruit', 'Fruits', true),
  ('herbs', 'Herbs', true),
  ('livestock', 'Livestock', true),
  ('poultry', 'Poultry', true),
  ('small-stock', 'Small stock', true)
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "is_active" = true;--> statement-breakpoint
CREATE TABLE "produce_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "produce_type_id" uuid;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "in_stock" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location_label" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location_latitude" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location_longitude" double precision;--> statement-breakpoint
ALTER TABLE "produce_types" ADD CONSTRAINT "produce_types_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "produce_types_category_name_unique" ON "produce_types" USING btree ("category_id","name");--> statement-breakpoint
CREATE INDEX "produce_types_category_active_idx" ON "produce_types" USING btree ("category_id","active");--> statement-breakpoint
INSERT INTO "produce_types" ("category_id", "name", "active")
SELECT "id", 'Other', false FROM "categories"
ON CONFLICT ("category_id", "name") DO NOTHING;--> statement-breakpoint
UPDATE "listings" AS listing
SET "produce_type_id" = produce_type."id"
FROM "produce_types" AS produce_type
WHERE produce_type."category_id" = listing."category_id" AND produce_type."name" = 'Other';--> statement-breakpoint
ALTER TABLE "listings" ALTER COLUMN "produce_type_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_produce_type_id_produce_types_id_fk" FOREIGN KEY ("produce_type_id") REFERENCES "public"."produce_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listings_produce_availability_idx" ON "listings" USING btree ("produce_type_id","status","active","in_stock","expires_at");--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_location_coordinates_check" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL) OR
  ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_location_coordinates_check" CHECK (
  ("location_latitude" IS NULL AND "location_longitude" IS NULL) OR
  ("location_latitude" IS NOT NULL AND "location_longitude" IS NOT NULL AND "location_latitude" BETWEEN -90 AND 90 AND "location_longitude" BETWEEN -180 AND 180)
);
