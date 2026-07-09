-- AlterTable
ALTER TABLE "HouseTransaction" ADD COLUMN     "legId" TEXT,
ADD COLUMN     "parlayId" TEXT;

-- AlterTable
ALTER TABLE "LegStake" ADD COLUMN     "payout" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "rolledForwardFromLegId" TEXT;

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "committedSettled" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "LegStake" ADD CONSTRAINT "LegStake_rolledForwardFromLegId_fkey" FOREIGN KEY ("rolledForwardFromLegId") REFERENCES "ParlayLeg"("id") ON DELETE SET NULL ON UPDATE CASCADE;
