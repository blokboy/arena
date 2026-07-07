import { describe, expect, test } from "vitest";

import { POST as buyPosition } from "@/app/api/positions/route";
import { normalizeGammaEvent, type GammaMarket } from "@/domain/markets";
import { marketCacheRepository } from "@/server/markets";
import { userRepository } from "@/server/users";
import { jsonRequest } from "@test/helpers/api";
import { binaryGammaEvent } from "@test/helpers/gamma-fixtures";

function seedCachedMarket(marketOverrides: Partial<GammaMarket> = {}) {
  const event = binaryGammaEvent();
  event.markets = [{ ...event.markets?.[0], ...marketOverrides }];
  marketCacheRepository.upsertCategoryEvents({
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

describe("POST /api/positions", () => {
  test("rejects anonymous callers", async () => {
    seedCachedMarket();

    const response = await buyPosition(
      buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "250" })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: { code: "UNAUTHENTICATED" } });
  });

  test("buys at bestAsk, returns the created lot and the debited balance", async () => {
    seedCachedMarket();
    const user = seedUser();

    const response = await buyPosition(
      buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "250" }, user.id)
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      position: {
        id: "lot_1",
        userId: user.id,
        marketId: "market-democrat-win-2028",
        marketQuestion: "Will a Democrat win the 2028 US presidential election?",
        outcomeIndex: 0,
        outcomeLabel: "Yes",
        status: "OPEN",
        stake: "250",
        shares: "390.625",
        committedShares: "0",
        entryPrice: "0.64",
        purchasedAt: "2026-01-15T12:00:00.000Z"
      },
      balance: 750
    });
    expect(userRepository.findById(user.id)?.balance).toBe(750);
  });

  test("repeat buys return separate lots and keep debiting", async () => {
    seedCachedMarket();
    const user = seedUser();

    const first = await buyPosition(
      buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "100" }, user.id)
    );
    const second = await buyPosition(
      buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "100" }, user.id)
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstBody = (await first.json()) as { position: { id: string }; balance: number };
    const secondBody = (await second.json()) as { position: { id: string }; balance: number };
    expect(firstBody.position.id).not.toBe(secondBody.position.id);
    expect(firstBody.balance).toBe(900);
    expect(secondBody.balance).toBe(800);
  });

  test("rejects unparseable and malformed bodies", async () => {
    seedCachedMarket();
    const user = seedUser();

    const unparseable = await buyPosition(
      new Request("http://arena.test/api/positions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user-id": user.id },
        body: "not json"
      })
    );
    const missingMarketId = await buyPosition(
      buyRequest({ outcomeIndex: 0, stake: "250" }, user.id)
    );
    const numericMarketId = await buyPosition(
      buyRequest({ marketId: 42, outcomeIndex: 0, stake: "250" }, user.id)
    );

    expect(unparseable.status).toBe(400);
    await expect(unparseable.json()).resolves.toEqual({ error: { code: "INVALID_BODY" } });
    expect(missingMarketId.status).toBe(400);
    await expect(missingMarketId.json()).resolves.toEqual({
      error: { code: "INVALID_MARKET_ID" }
    });
    expect(numericMarketId.status).toBe(400);
    await expect(numericMarketId.json()).resolves.toEqual({
      error: { code: "INVALID_MARKET_ID" }
    });
  });

  test("rejects invalid outcomes with INVALID_OUTCOME", async () => {
    seedCachedMarket();
    const user = seedUser();

    for (const outcomeIndex of ["0", undefined, 2, -1, 0.5]) {
      const response = await buyPosition(
        buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex, stake: "250" }, user.id)
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: { code: "INVALID_OUTCOME" } });
    }
  });

  test("rejects malformed stakes with INVALID_STAKE", async () => {
    seedCachedMarket();
    const user = seedUser();

    for (const stake of [250, undefined, "abc", "-5", "0", "1.234"]) {
      const response = await buyPosition(
        buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake }, user.id)
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: { code: "INVALID_STAKE" } });
    }
    expect(userRepository.findById(user.id)?.balance).toBe(1000);
  });

  test("rejects unknown markets with MARKET_NOT_FOUND and debits nothing", async () => {
    seedCachedMarket();
    const user = seedUser();

    const response = await buyPosition(
      buyRequest({ marketId: "market-unknown", outcomeIndex: 0, stake: "250" }, user.id)
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: { code: "MARKET_NOT_FOUND" } });
    expect(userRepository.findById(user.id)?.balance).toBe(1000);
  });

  test("rejects closed markets with MARKET_CLOSED and debits nothing", async () => {
    seedCachedMarket({ closed: true });
    const user = seedUser();

    const response = await buyPosition(
      buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "250" }, user.id)
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: { code: "MARKET_CLOSED" } });
    expect(userRepository.findById(user.id)?.balance).toBe(1000);
  });

  test("rejects inactive markets with MARKET_INACTIVE and debits nothing", async () => {
    seedCachedMarket({ active: false });
    const user = seedUser();

    const response = await buyPosition(
      buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "250" }, user.id)
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: { code: "MARKET_INACTIVE" } });
    expect(userRepository.findById(user.id)?.balance).toBe(1000);
  });

  test.each([
    ["null", null],
    ["zero", "0"]
  ])(
    "rejects markets with a %s bestAsk with PRICE_UNAVAILABLE and debits nothing",
    async (_label, bestAsk) => {
      seedCachedMarket({ bestAsk });
      const user = seedUser();

      const response = await buyPosition(
        buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "250" }, user.id)
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: { code: "PRICE_UNAVAILABLE" } });
      expect(userRepository.findById(user.id)?.balance).toBe(1000);
    }
  );

  test("rejects stakes over the balance with INSUFFICIENT_BALANCE and debits nothing", async () => {
    seedCachedMarket();
    const user = seedUser();

    const response = await buyPosition(
      buyRequest(
        { marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "1000.01" },
        user.id
      )
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: { code: "INSUFFICIENT_BALANCE" } });
    expect(userRepository.findById(user.id)?.balance).toBe(1000);
  });

  test("allows staking the entire balance down to exactly zero", async () => {
    seedCachedMarket();
    const user = seedUser();

    const response = await buyPosition(
      buyRequest({ marketId: "market-democrat-win-2028", outcomeIndex: 0, stake: "1000" }, user.id)
    );

    expect(response.status).toBe(201);
    expect(userRepository.findById(user.id)?.balance).toBe(0);
  });
});
