ALTER TABLE "Parlay"
ADD CONSTRAINT "Parlay_kind_dayKey_key" UNIQUE ("kind", "dayKey");

ALTER TABLE "ParlayLeg"
ADD COLUMN "claimedByUserId" TEXT;

ALTER TABLE "ParlayLeg"
ADD CONSTRAINT "ParlayLeg_claimedByUserId_fkey"
FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
