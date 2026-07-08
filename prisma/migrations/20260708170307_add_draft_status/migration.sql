-- AlterEnum: add DRAFT to ParlayStatus
-- Neon-safe: create new type, swap columns, drop old type
CREATE TYPE "ParlayStatus_new" AS ENUM ('DRAFT', 'ACTIVE', 'WON', 'LOST', 'VOIDED');

ALTER TABLE "Parlay" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Parlay" ALTER COLUMN "status" TYPE "ParlayStatus_new" USING ("status"::text::"ParlayStatus_new");

ALTER TABLE "Parlay" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "ParlayStatus";

ALTER TYPE "ParlayStatus_new" RENAME TO "ParlayStatus";
