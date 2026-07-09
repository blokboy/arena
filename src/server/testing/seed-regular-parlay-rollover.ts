import { POST as createParlay } from "@/app/api/parlays/route";
import { POST as createLeg } from "@/app/api/parlays/[id]/legs/route";
import { POST as stakeLeg } from "@/app/api/parlays/[id]/legs/[legId]/stake/route";
import { hashPassword } from "@/domain/auth";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { userRepository } from "@/server/users";
import { jsonRequest } from "@test/helpers/api";

function suffix() {
  return Math.random().toString(36).slice(2, 8);
}

export async function seedDecisiveRegularParlayRollover() {
  const id = suffix();
  const password = "long-enough";
  const aliceUsername = `rv-al-${id}`;
  const bobUsername = `rv-bb-${id}`;
  const [aliceHash, bobHash] = await Promise.all([hashPassword(password), hashPassword(password)]);
  const [alice, bob] = await Promise.all([
    userRepository.createUser({ username: aliceUsername, passwordHash: aliceHash }),
    userRepository.createUser({ username: bobUsername, passwordHash: bobHash })
  ]);

  const currentMarketId = `market-roll-current-${id}`;
  const nextMarketId = `market-roll-next-${id}`;
  const currentQuestion = `Current rollover leg ${id}?`;
  const nextQuestion = `Next rollover leg ${id}?`;

  await marketCacheRepository.upsertCategoryEvents({
    category: "Politics",
    events: [
      {
        gammaId: `event-roll-current-${id}`,
        category: "Politics",
        title: "Regular parlay rollover current leg",
        slug: `regular-parlay-roll-current-${id}`,
        volume: "1000",
        lastSyncedAt: "2026-01-15T11:00:00.000Z",
        markets: [
          {
            gammaId: currentMarketId,
            eventGammaId: `event-roll-current-${id}`,
            eventTitle: "Regular parlay rollover current leg",
            category: "Politics",
            question: currentQuestion,
            slug: `current-rollover-leg-${id}`,
            outcomes: ["Yes", "No"],
            outcomePrices: ["0.56", "0.44"],
            bestBid: "0.55",
            bestAsk: "0.57",
            lastTradePrice: "0.56",
            active: true,
            closed: false,
            endDate: "2028-11-08T00:00:00.000Z",
            volume: "1000",
            lastSyncedAt: "2026-01-15T11:00:00.000Z"
          }
        ]
      },
      {
        gammaId: `event-roll-next-${id}`,
        category: "Politics",
        title: "Regular parlay rollover next leg",
        slug: `regular-parlay-roll-next-${id}`,
        volume: "1200",
        lastSyncedAt: "2026-01-15T11:00:00.000Z",
        markets: [
          {
            gammaId: nextMarketId,
            eventGammaId: `event-roll-next-${id}`,
            eventTitle: "Regular parlay rollover next leg",
            category: "Politics",
            question: nextQuestion,
            slug: `next-rollover-leg-${id}`,
            outcomes: ["Yes", "No"],
            outcomePrices: ["0.25", "0.75"],
            bestBid: "0.24",
            bestAsk: "0.25",
            lastTradePrice: "0.25",
            active: true,
            closed: false,
            endDate: "2028-11-09T00:00:00.000Z",
            volume: "1200",
            lastSyncedAt: "2026-01-15T11:00:00.000Z"
          }
        ]
      }
    ]
  });

  const [currentMarket, nextMarket] = await Promise.all([
    prisma.cachedMarket.findUniqueOrThrow({
      where: { gammaId: currentMarketId },
      select: { id: true }
    }),
    prisma.cachedMarket.findUniqueOrThrow({
      where: { gammaId: nextMarketId },
      select: { id: true }
    })
  ]);

  const [aliceCurrentPosition, bobCurrentPosition, bobNextPosition] = await Promise.all([
    prisma.position.create({
      data: {
        userId: alice.id,
        marketId: currentMarket.id,
        outcomeIndex: 0,
        entryPrice: "0.64",
        stake: "64",
        shares: "100"
      }
    }),
    prisma.position.create({
      data: {
        userId: bob.id,
        marketId: currentMarket.id,
        outcomeIndex: 0,
        entryPrice: "0.50",
        stake: "10",
        shares: "20"
      }
    }),
    prisma.position.create({
      data: {
        userId: bob.id,
        marketId: nextMarket.id,
        outcomeIndex: 0,
        entryPrice: "0.20",
        stake: "2",
        shares: "10"
      }
    })
  ]);

  const createResponse = await createParlay(
    jsonRequest(
      "http://arena.test/api/parlays",
      { name: `Rollover ${id}`, inviteUserIds: [bob.id] },
      { "x-test-user-id": alice.id }
    )
  );
  const { parlay } = (await createResponse.json()) as { parlay: { id: string } };

  const createLegResponse = await createLeg(
    jsonRequest(
      `http://arena.test/api/parlays/${parlay.id}/legs`,
      {
        marketId: currentMarketId,
        outcomeIndex: 0,
        commitments: [{ positionId: aliceCurrentPosition.id, shares: "100" }]
      },
      { "x-test-user-id": alice.id }
    ),
    { params: Promise.resolve({ id: parlay.id }) }
  );
  const { leg } = (await createLegResponse.json()) as { leg: { id: string } };

  await stakeLeg(
    jsonRequest(
      `http://arena.test/api/parlays/${parlay.id}/legs/${leg.id}/stake`,
      { commitments: [{ positionId: bobCurrentPosition.id, shares: "20" }] },
      { "x-test-user-id": bob.id }
    ),
    { params: Promise.resolve({ id: parlay.id, legId: leg.id }) }
  );

  await createLeg(
    jsonRequest(
      `http://arena.test/api/parlays/${parlay.id}/legs`,
      {
        marketId: nextMarketId,
        outcomeIndex: 0,
        commitments: [{ positionId: bobNextPosition.id, shares: "10" }]
      },
      { "x-test-user-id": bob.id }
    ),
    { params: Promise.resolve({ id: parlay.id }) }
  );

  return {
    parlayId: parlay.id,
    alice: {
      username: aliceUsername,
      password
    },
    currentQuestion,
    nextQuestion
  };
}
