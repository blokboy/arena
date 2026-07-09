-- CreateEnum
CREATE TYPE "LegStatus" AS ENUM ('PENDING', 'ACTIVE', 'WON', 'LOST', 'ROLLED_OVER', 'VOIDED');

-- CreateEnum
CREATE TYPE "LegStakeStatus" AS ENUM ('PENDING', 'ACTIVE', 'WON', 'LOST', 'ROLLED_OVER', 'VOIDED_REFUNDED');

-- AlterTable
ALTER TABLE "LegStake" ADD COLUMN     "amount" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "averageEntryPrice" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "status" "LegStakeStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
-- ParlayLeg.status was a plain String with existing values that are also
-- valid LegStatus labels (PENDING/ACTIVE/LOST) — cast in place instead of
-- Prisma's default drop-and-recreate, which would silently wipe every leg's
-- real status back to the column default.
ALTER TABLE "ParlayLeg" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ParlayLeg" ALTER COLUMN "status" TYPE "LegStatus" USING ("status"::"LegStatus");
ALTER TABLE "ParlayLeg" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "LegStake_legId_status_idx" ON "LegStake"("legId", "status");
