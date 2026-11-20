CREATE TYPE "public"."deal_value_band" AS ENUM('under_5k', '5k_50k', '50k_250k', 'over_250k', 'prefer_not_to_say');--> statement-breakpoint
CREATE TYPE "public"."enquiry_outcome" AS ENUM('deal_made', 'no_deal');--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "outcome" "enquiry_outcome";--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "outcome_value_band" "deal_value_band";--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "outcome_recorded_at" timestamp with time zone;