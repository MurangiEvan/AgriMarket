DROP TABLE "deletion_requests";
DROP TYPE "public"."deletion_request_status";
ALTER TABLE "users" DROP COLUMN "privacy_version";
ALTER TABLE "users" DROP COLUMN "privacy_accepted_at";
