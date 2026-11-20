CREATE TYPE "public"."rating_comment_status" AS ENUM('none', 'pending', 'approved', 'hidden');--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enquiry_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"stars" smallint NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"comment_status" "rating_comment_status" DEFAULT 'none' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_stars_range" CHECK ("ratings"."stars" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_enquiry_unique" ON "ratings" USING btree ("enquiry_id");--> statement-breakpoint
CREATE INDEX "ratings_business_idx" ON "ratings" USING btree ("business_id","hidden");--> statement-breakpoint
CREATE INDEX "ratings_comment_status_idx" ON "ratings" USING btree ("comment_status","created_at");