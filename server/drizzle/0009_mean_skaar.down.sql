ALTER TABLE "users" DROP COLUMN "organisation_type";
ALTER TABLE "users" DROP COLUMN "organisation_name";
ALTER TABLE "businesses" DROP COLUMN "agriseta_supported";
ALTER TABLE "businesses" DROP COLUMN "agriseta_reference";
ALTER TABLE "businesses" DROP COLUMN "agriseta_support_claimed";
DROP TYPE "public"."buyer_organisation_type";
