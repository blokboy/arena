-- Reconciles drift found on the shared test database: exitPrice/exitedAt
-- were already applied there (outside tracked migrations, from an earlier
-- #10 attempt) but never committed as a migration file. This file records
-- that already-applied change so migration history matches reality.
ALTER TABLE "LegStake" ADD COLUMN "exitPrice" DECIMAL(18,6);
ALTER TABLE "LegStake" ADD COLUMN "exitedAt" TIMESTAMP(3);
