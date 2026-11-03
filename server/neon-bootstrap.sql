-- AgriMarket Neon bootstrap for a fresh database only.
-- Prefer `npm run db:migrate` when the API environment is configured.
-- This file mirrors drizzle/0000 through drizzle/0006 and records their exact
-- Drizzle hashes so subsequent `npm run db:migrate` calls do not replay DDL.
-- Do not run against a database that already contains AgriMarket tables.

BEGIN;

CREATE TYPE "public"."business_verification_status" AS ENUM ('not_submitted', 'pending', 'approved', 'rejected');
CREATE TYPE "public"."enquiry_status" AS ENUM ('new', 'read', 'responded', 'closed');
CREATE TYPE "public"."listing_status" AS ENUM ('draft', 'pending', 'published', 'rejected', 'archived');
CREATE TYPE "public"."listing_type" AS ENUM ('product', 'service');
CREATE TYPE "public"."south_african_province" AS ENUM ('Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape');
CREATE TYPE "public"."user_role" AS ENUM ('buyer', 'seller', 'admin');
CREATE TYPE "public"."verification_submission_status" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE "public"."audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" uuid,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."businesses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "province" "south_african_province" NOT NULL,
  "town" text,
  "contact_email" text,
  "contact_phone" text,
  "whatsapp_phone" text,
  "verification_status" "business_verification_status" DEFAULT 'not_submitted' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL
);

CREATE TABLE "public"."enquiries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "buyer_id" uuid NOT NULL,
  "business_id" uuid NOT NULL,
  "listing_id" uuid NOT NULL,
  "message" text NOT NULL,
  "status" "enquiry_status" DEFAULT 'new' NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."listing_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "storage_key" text NOT NULL,
  "alt_text" text NOT NULL,
  "mime_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "width" integer,
  "height" integer,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."listings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "province" "south_african_province" NOT NULL,
  "town" text,
  "type" "listing_type" NOT NULL,
  "status" "listing_status" DEFAULT 'draft' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" "user_role" DEFAULT 'buyer' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "email_verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."verification_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL,
  "submitter_id" uuid NOT NULL,
  "reviewer_id" uuid,
  "storage_keys" text[] NOT NULL,
  "status" "verification_submission_status" DEFAULT 'pending' NOT NULL,
  "internal_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_at" timestamp with time zone
);

ALTER TABLE "public"."verification_submissions" ADD COLUMN "seller_feedback" text;

ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "public"."businesses" ADD CONSTRAINT "businesses_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "public"."enquiries" ADD CONSTRAINT "enquiries_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "public"."enquiries" ADD CONSTRAINT "enquiries_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "public"."enquiries" ADD CONSTRAINT "enquiries_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "public"."listing_images" ADD CONSTRAINT "listing_images_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."listings" ADD CONSTRAINT "listings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "public"."listings" ADD CONSTRAINT "listings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."verification_submissions" ADD CONSTRAINT "verification_submissions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "public"."verification_submissions" ADD CONSTRAINT "verification_submissions_submitter_id_users_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "public"."verification_submissions" ADD CONSTRAINT "verification_submissions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX "audit_logs_target_created_idx" ON "public"."audit_logs" USING btree ("target_type", "target_id", "created_at");
CREATE UNIQUE INDEX "businesses_owner_id_unique" ON "public"."businesses" USING btree ("owner_id");
CREATE UNIQUE INDEX "categories_slug_unique" ON "public"."categories" USING btree ("slug");
CREATE UNIQUE INDEX "enquiries_buyer_idempotency_unique" ON "public"."enquiries" USING btree ("buyer_id", "idempotency_key");
CREATE INDEX "enquiries_business_status_created_idx" ON "public"."enquiries" USING btree ("business_id", "status", "created_at");
CREATE INDEX "enquiries_buyer_created_idx" ON "public"."enquiries" USING btree ("buyer_id", "created_at");
CREATE INDEX "listing_images_listing_order_idx" ON "public"."listing_images" USING btree ("listing_id", "sort_order");
CREATE INDEX "listings_public_filter_idx" ON "public"."listings" USING btree ("status", "province", "category_id", "created_at");
CREATE INDEX "listings_business_id_idx" ON "public"."listings" USING btree ("business_id");
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "public"."sessions" USING btree ("token_hash");
CREATE INDEX "sessions_user_id_idx" ON "public"."sessions" USING btree ("user_id");
CREATE UNIQUE INDEX "users_email_unique" ON "public"."users" USING btree ("email");
CREATE INDEX "verification_queue_idx" ON "public"."verification_submissions" USING btree ("status", "created_at");
CREATE INDEX "businesses_name_search_idx" ON "public"."businesses" USING gin (to_tsvector('simple', "name"));
CREATE INDEX "listings_search_idx" ON "public"."listings" USING gin (to_tsvector('simple', "title" || ' ' || "description"));
CREATE UNIQUE INDEX "verification_one_pending_per_business_unique" ON "public"."verification_submissions" USING btree ("business_id") WHERE "status" = 'pending';

UPDATE "public"."categories" SET "name" = 'Fruits' WHERE "slug" = 'fruit';
INSERT INTO "public"."categories" ("slug", "name", "is_active") VALUES
  ('vegetables', 'Vegetables', true),
  ('fruit', 'Fruits', true),
  ('herbs', 'Herbs', true),
  ('livestock', 'Livestock', true),
  ('poultry', 'Poultry', true),
  ('small-stock', 'Small stock', true)
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "is_active" = true;

CREATE TABLE "public"."produce_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "category_id" uuid NOT NULL,
  "name" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);
ALTER TABLE "public"."businesses" ADD COLUMN "latitude" double precision;
ALTER TABLE "public"."businesses" ADD COLUMN "longitude" double precision;
ALTER TABLE "public"."listings" ADD COLUMN "produce_type_id" uuid;
ALTER TABLE "public"."listings" ADD COLUMN "active" boolean DEFAULT true NOT NULL;
ALTER TABLE "public"."listings" ADD COLUMN "in_stock" boolean DEFAULT true NOT NULL;
ALTER TABLE "public"."listings" ADD COLUMN "expires_at" timestamp with time zone;
ALTER TABLE "public"."users" ADD COLUMN "location_label" text;
ALTER TABLE "public"."users" ADD COLUMN "location_latitude" double precision;
ALTER TABLE "public"."users" ADD COLUMN "location_longitude" double precision;
ALTER TABLE "public"."produce_types" ADD CONSTRAINT "produce_types_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE UNIQUE INDEX "produce_types_category_name_unique" ON "public"."produce_types" USING btree ("category_id", "name");
CREATE INDEX "produce_types_category_active_idx" ON "public"."produce_types" USING btree ("category_id", "active");
INSERT INTO "public"."produce_types" ("category_id", "name", "active")
SELECT "id", 'Other', false FROM "public"."categories"
ON CONFLICT ("category_id", "name") DO NOTHING;
UPDATE "public"."listings" AS listing
SET "produce_type_id" = produce_type."id"
FROM "public"."produce_types" AS produce_type
WHERE produce_type."category_id" = listing."category_id" AND produce_type."name" = 'Other';
ALTER TABLE "public"."listings" ALTER COLUMN "produce_type_id" SET NOT NULL;
ALTER TABLE "public"."listings" ADD CONSTRAINT "listings_produce_type_id_produce_types_id_fk" FOREIGN KEY ("produce_type_id") REFERENCES "public"."produce_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE INDEX "listings_produce_availability_idx" ON "public"."listings" USING btree ("produce_type_id", "status", "active", "in_stock", "expires_at");
ALTER TABLE "public"."businesses" ADD CONSTRAINT "businesses_location_coordinates_check" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL) OR
  ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);
ALTER TABLE "public"."users" ADD CONSTRAINT "users_location_coordinates_check" CHECK (
  ("location_latitude" IS NULL AND "location_longitude" IS NULL) OR
  ("location_latitude" IS NOT NULL AND "location_longitude" IS NOT NULL AND "location_latitude" BETWEEN -90 AND 90 AND "location_longitude" BETWEEN -180 AND 180)
);
CREATE INDEX "businesses_location_latitude_longitude_idx" ON "public"."businesses" USING btree ("latitude", "longitude");
ALTER TABLE "public"."businesses" ADD COLUMN "address" text;

CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  "id" serial PRIMARY KEY,
  "hash" text NOT NULL,
  "created_at" bigint
);
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES
  ('15ce4b49b90d0c812fea34e6f2d07da90fed215e4c473822c9620035110e04d8', 1793007894792),
  ('a32bf906943fb270c075fe0266186a61f68f4054749b500051d85b10f015e22f', 1793008278992),
  ('2d116233e48a5ee2b8f7fa6931caae39babbef278bb325d17a7fb1d1ce8ff949', 1793013453331),
  ('005d4eea915c1800d33dda2c540e3cc28c1573c6ba1078532c062d74aef2a1b9', 1793014039385),
  ('08450b2eed10e4578e5bb615f8b66c4da9c54fb369364277e5d933d2ab326d8f', 1793695234849),
  ('7e742fca90124100a4f46db730ac274101d24e48de226cbf6c5dbcd81330f079', 1793695987033),
  ('f4e739223fff25328be555e6a621933dafe50f396fe5708ba7283121257edea0', 1793696646510);

-- The API seeds controlled categories separately with `npm run db:seed`.
-- Do not add real users, admin passwords, or verification documents here.

COMMIT;