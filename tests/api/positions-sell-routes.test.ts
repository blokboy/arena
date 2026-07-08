import { describe, expect, test } from "vitest";

import { GET as listPositions, POST as buyPosition } from "@/app/api/positions/route";
import { POST as sellAllPositions } from "@/app/api/positions/sell-all/route";
import { POST as sellPosition } from "@/app/api/positions/[id]/sell/route";
import { normalizeGammaEvent, type GammaMarket } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { userRepository } from "@/server/users";
import { jsonRequest } from "@test/helpers/api";
import { binaryGammaEvent } from "@test/helpers/gamma-fixtures";

async function seedCachedMarket(marketOverrides: Partial<GammaMarket> = {}) {
  const event = binaryGammaEvent();
  event.markets = [{ ...event.markets?.[0], ...marketOverrides }];
  await marketCacheRepository.upsertCategoryEvents({
    category: "Politics",
    events: [
      normalizeGammaEvent(event, {
        category: "Politics",
        lastSyncedAt: "2026-01-15T11:00:00.000Z"
      })
    ]
  });
}

function seedUser(username = "mira") {
  return userRepository.createUser({ username, passwordHash: "hashed" });
}

function buyRequest(body: unknown, userId?: string) {
  return jsonRequest(
    "http://arena.test/api/positions",
    body,
    userId ? { "x-test-user-id": userId } : undefined
  );
}

function sellAllRequest(body: unknown, userId?: string) {
  return jsonRequest(
    "http://arena.test/api/positions/sell-all",
    body,
    userId ? { "x-test-user-id": userId } : undefined
  );
}

describe("GET /api/positions", () => {
  test("rejects anonymous callers", async () => {
    await seedCachedMarket();

    const response = await listPositions(new Request("http://arena.test/api/positions"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: { code: "UNAUTHENTICATED" } });
  });

  test("lists caller positions with current price data and optional marketId filtering", async () => {
    await seedCachedMarket();
    const user = await seedUser();

    await buyPosition(
      buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "64" }, user.id)
    );
    await buyPosition(
      buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 1, stake: "64" }, user.id)
    );

    const response = await listPositions(
      new Request("http://arena.test/api/positions?marketId=market-democrat-win-2028", {
        headers: { "x-test-user-id": user.id }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      positions: [
        expect.objectContaining({
          marketId: "market-democrat-win-2028",
          outcomeIndex: 0,
          currentBestBid: "0.62",
          currentBestAsk: "0.64",
          currentSellValue: "62",
          availableShares: "100",
          marketActive: true,
          marketClosed: false
        }),
        expect.objectContaining({
          marketId: "market-democrat-win-2028",
          outcomeIndex: 1,
          currentBestBid: "0.62",
          currentBestAsk: "0.64",
          currentSellValue: "62",
          availableShares: "100",
          marketActive: true,
          marketClosed: false
        })
      ]
    });
  });
});

describe("POST /api/positions/:id/sell", () => {
  test("rejects selling someone else's position", async () => {
    await seedCachedMarket();
    const owner = await seedUser("owner");
    const other = await seedUser("other");

    const buyResponse = await buyPosition(
      buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "64" }, owner.id)
    );
    const { position } = (await buyResponse.json()) as { position: { id: string } };

    const response = await sellPosition(
      new Request(`http://arena.test/api/positions/${position.id}/sell`, {
        method: "POST",
        headers: { "x-test-user-id": other.id }
      }),
      { params: Promise.resolve({ id: position.id }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: { code: "POSITION_NOT_OWNED" } });
  });

  test("rejects already-sold positions and positions with no available shares", async () => {
    await seedCachedMarket();
    const user = await seedUser();

    const buyResponse = await buyPosition(
      buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "64" }, user.id)
    );
    const { position } = (await buyResponse.json()) as { position: { id: string } };

    const firstSell = await sellPosition(
      new Request(`http://arena.test/api/positions/${position.id}/sell`, {
        method: "POST",
        headers: { "x-test-user-id": user.id }
      }),
      { params: Promise.resolve({ id: position.id }) }
    );
    expect(firstSell.status).toBe(200);

    const soldAgain = await sellPosition(
      new Request(`http://arena.test/api/positions/${position.id}/sell`, {
        method: "POST",
        headers: { "x-test-user-id": user.id }
      }),
      { params: Promise.resolve({ id: position.id }) }
    );
    expect(soldAgain.status).toBe(409);
    await expect(soldAgain.json()).resolves.toEqual({ error: { code: "POSITION_NOT_OPEN" } });

    const committedBuyResponse = await buyPosition(
      buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "64" }, user.id)
    );
    const { position: committed } = (await committedBuyResponse.json()) as {
      position: { id: string };
    };
    await prisma.position.update({
      where: { id: committed.id },
      data: { committedShares: "100" }
    });

    const noAvailable = await sellPosition(
      new Request(`http://arena.test/api/positions/${committed.id}/sell`, {
        method: "POST",
        headers: { "x-test-user-id": user.id }
      }),
      { params: Promise.resolve({ id: committed.id }) }
    );
    expect(noAvailable.status).toBe(409);
    await expect(noAvailable.json()).resolves.toEqual({
      error: { code: "NO_AVAILABLE_SHARES" }
    });
  });

  test("rejects closed markets for selling", async () => {
    await seedCachedMarket();
    const user = await seedUser();

    const buyResponse = await buyPosition(
      buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "64" }, user.id)
    );
    const { position } = (await buyResponse.json()) as { position: { id: string } };
    await seedCachedMarket({ closed: true });

    const response = await sellPosition(
      new Request(`http://arena.test/api/positions/${position.id}/sell`, {
        method: "POST",
        headers: { "x-test-user-id": user.id }
      }),
      { params: Promise.resolve({ id: position.id }) }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: { code: "MARKET_CLOSED" } });
  });
});

describe("POST /api/positions/sell-all", () => {
  test("validates body and lifecycle rules", async () => {
    await seedCachedMarket();
    const user = await seedUser();

    const invalidBody = await sellAllPositions(
      new Request("http://arena.test/api/positions/sell-all", {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user-id": user.id },
        body: "not json"
      })
    );
    expect(invalidBody.status).toBe(400);
    await expect(invalidBody.json()).resolves.toEqual({ error: { code: "INVALID_BODY" } });

    const invalidOutcome = await sellAllPositions(
      sellAllRequest({ marketId: "market-democrat-win-2028" }, user.id)
    );
    expect(invalidOutcome.status).toBe(400);
    await expect(invalidOutcome.json()).resolves.toEqual({ error: { code: "INVALID_OUTCOME" } });
  });

  test("sells only available shares in the group", async () => {
    await seedCachedMarket();
    const user = await seedUser();

    const firstBuy = await buyPosition(
      buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "64" }, user.id)
    );
    const secondBuy = await buyPosition(
      buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "128" }, user.id)
    );
    const first = (await firstBuy.json()) as { position: { id: string } };
    const second = (await secondBuy.json()) as { position: { id: string } };
    await prisma.position.update({
      where: { id: second.position.id },
      data: { committedShares: "50" }
    });

    const response = await sellAllPositions(
      sellAllRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0 }, user.id)
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      positions: [
        expect.objectContaining({ id: first.position.id, status: "SOLD", shares: "0", stake: "0" }),
        expect.objectContaining({
          id: second.position.id,
          status: "OPEN",
          shares: "50",
          committedShares: "50",
          stake: "32"
        })
      ],
      proceeds: "155",
      balance: 963
    });
  });
});
