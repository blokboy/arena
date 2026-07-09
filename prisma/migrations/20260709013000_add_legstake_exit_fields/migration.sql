-- AlterTable: add rollover-exit stamp fields to LegStake (PRD Part III §7.2)
ALTER TABLE "LegStake" ADD COLUMN     "exitPrice" DECIMAL(18,6),
ADD COLUMN     "exitedAt" TIMESTAMP(3);
