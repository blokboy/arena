-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'SOLD', 'WON', 'LOST', 'VOIDED');

-- CreateEnum
CREATE TYPE "ParlayKind" AS ENUM ('REGULAR', 'DAYS_PARLAY');

-- CreateEnum
CREATE TYPE "ParlayStatus" AS ENUM ('ACTIVE', 'WON', 'LOST', 'VOIDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "balance" DECIMAL(18,6) NOT NULL DEFAULT 1000,
    "signupBannerAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedEvent" (
    "id" TEXT NOT NULL,
    "gammaId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "volume" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedMarket" (
    "id" TEXT NOT NULL,
    "gammaId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "outcomes" JSONB NOT NULL,
    "outcomePrices" JSONB NOT NULL,
    "bestBid" DECIMAL(18,6) NOT NULL,
    "bestAsk" DECIMAL(18,6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "endDate" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedMarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "outcomeIndex" INTEGER NOT NULL,
    "entryPrice" DECIMAL(18,6) NOT NULL,
    "stake" DECIMAL(18,6) NOT NULL,
    "shares" DECIMAL(18,6) NOT NULL,
    "committedShares" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "PositionStatus" NOT NULL DEFAULT 'OPEN',
    "exitPrice" DECIMAL(18,6),
    "realizedPoints" DECIMAL(18,6),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parlay" (
    "id" TEXT NOT NULL,
    "kind" "ParlayKind" NOT NULL,
    "name" TEXT NOT NULL,
    "dayKey" TEXT,
    "creatorId" TEXT,
    "status" "ParlayStatus" NOT NULL DEFAULT 'ACTIVE',
    "rolloverUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParlayMember" (
    "parlayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ParlayMember_pkey" PRIMARY KEY ("parlayId","userId")
);

-- CreateTable
CREATE TABLE "ParlayLeg" (
    "id" TEXT NOT NULL,
    "parlayId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "outcomeIndex" INTEGER NOT NULL,
    "resolutionAt" TIMESTAMP(3) NOT NULL,
    "sortKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParlayLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegStake" (
    "id" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shares" DECIMAL(18,6) NOT NULL,
    "committedPrincipal" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "LegStake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegStakeSource" (
    "id" TEXT NOT NULL,
    "stakeId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "shares" DECIMAL(18,6) NOT NULL,
    "principal" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "LegStakeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolloverVote" (
    "id" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT,
    "value" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolloverVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseTransaction" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankruptcyStipendGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankruptcyStipendGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "CachedEvent_gammaId_key" ON "CachedEvent"("gammaId");

-- CreateIndex
CREATE UNIQUE INDEX "CachedMarket_gammaId_key" ON "CachedMarket"("gammaId");

-- CreateIndex
CREATE UNIQUE INDEX "ParlayLeg_parlayId_marketId_key" ON "ParlayLeg"("parlayId", "marketId");

-- CreateIndex
CREATE UNIQUE INDEX "LegStake_legId_userId_key" ON "LegStake"("legId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RolloverVote_legId_userId_key" ON "RolloverVote"("legId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BankruptcyStipendGrant_userId_dayKey_key" ON "BankruptcyStipendGrant"("userId", "dayKey");

-- AddForeignKey
ALTER TABLE "CachedMarket" ADD CONSTRAINT "CachedMarket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CachedEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "CachedMarket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parlay" ADD CONSTRAINT "Parlay_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParlayMember" ADD CONSTRAINT "ParlayMember_parlayId_fkey" FOREIGN KEY ("parlayId") REFERENCES "Parlay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParlayMember" ADD CONSTRAINT "ParlayMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParlayLeg" ADD CONSTRAINT "ParlayLeg_parlayId_fkey" FOREIGN KEY ("parlayId") REFERENCES "Parlay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParlayLeg" ADD CONSTRAINT "ParlayLeg_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "CachedMarket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegStake" ADD CONSTRAINT "LegStake_legId_fkey" FOREIGN KEY ("legId") REFERENCES "ParlayLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegStake" ADD CONSTRAINT "LegStake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegStakeSource" ADD CONSTRAINT "LegStakeSource_stakeId_fkey" FOREIGN KEY ("stakeId") REFERENCES "LegStake"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegStakeSource" ADD CONSTRAINT "LegStakeSource_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolloverVote" ADD CONSTRAINT "RolloverVote_legId_fkey" FOREIGN KEY ("legId") REFERENCES "ParlayLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolloverVote" ADD CONSTRAINT "RolloverVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankruptcyStipendGrant" ADD CONSTRAINT "BankruptcyStipendGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
