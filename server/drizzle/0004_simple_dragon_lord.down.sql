ALTER TABLE "listings" DROP CONSTRAINT "listings_produce_type_id_produce_types_id_fk";
DROP INDEX "listings_produce_availability_idx";
ALTER TABLE "listings" DROP COLUMN "produce_type_id";
ALTER TABLE "listings" DROP COLUMN "active";
ALTER TABLE "listings" DROP COLUMN "in_stock";
ALTER TABLE "listings" DROP COLUMN "expires_at";
ALTER TABLE "businesses" DROP CONSTRAINT "businesses_location_coordinates_check";
ALTER TABLE "businesses" DROP COLUMN "latitude";
ALTER TABLE "businesses" DROP COLUMN "longitude";
ALTER TABLE "users" DROP CONSTRAINT "users_location_coordinates_check";
ALTER TABLE "users" DROP COLUMN "location_label";
ALTER TABLE "users" DROP COLUMN "location_latitude";
ALTER TABLE "users" DROP COLUMN "location_longitude";
DROP TABLE "produce_types";
DELETE FROM "categories"
WHERE "slug" IN ('herbs', 'poultry', 'small-stock')
  AND NOT EXISTS (SELECT 1 FROM "listings" WHERE "listings"."category_id" = "categories"."id");
UPDATE "categories" SET "name" = 'Fruit' WHERE "slug" = 'fruit';
