ALTER TABLE "businesses" ADD COLUMN "sacaa_rpl_number" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "sacaa_roc_number" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "drone_licence_verified" boolean DEFAULT false NOT NULL;