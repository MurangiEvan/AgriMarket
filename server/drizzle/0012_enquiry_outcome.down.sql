ALTER TABLE "enquiries" DROP COLUMN "outcome_recorded_at";
ALTER TABLE "enquiries" DROP COLUMN "outcome_value_band";
ALTER TABLE "enquiries" DROP COLUMN "outcome";
DROP TYPE "public"."deal_value_band";
DROP TYPE "public"."enquiry_outcome";
