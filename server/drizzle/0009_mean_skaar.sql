CREATE TYPE "public"."buyer_organisation_type" AS ENUM('retailer', 'hotel', 'restaurant', 'processor', 'exporter', 'municipality', 'government_programme', 'school', 'commercial_farm', 'informal_trader', 'other');--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "agriseta_support_claimed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "agriseta_reference" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "agriseta_supported" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "organisation_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "organisation_type" "buyer_organisation_type";