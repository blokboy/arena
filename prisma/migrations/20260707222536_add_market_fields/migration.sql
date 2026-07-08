/*
  Warnings:

  - Added the required column `slug` to the `CachedEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `CachedMarket` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CachedEvent" ADD COLUMN     "slug" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "CachedMarket" ADD COLUMN     "lastTradePrice" DECIMAL(18,6),
ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "volume" DECIMAL(18,6) NOT NULL DEFAULT 0,
ALTER COLUMN "bestBid" DROP NOT NULL,
ALTER COLUMN "bestAsk" DROP NOT NULL,
ALTER COLUMN "endDate" DROP NOT NULL;
