import { describe, expect, test, vi } from "vitest";

import { GET as getMarket } from "@/app/api/markets/[marketId]/route";
import { GET as listMarkets } from "@/app/api/markets/route";
import { normalizeGammaEvent } from "@/domain/markets";
import { marketCacheRepository } from "@/server/markets";
import { userRepository } from "@/server/users";
import { binaryGammaEvent } from "@test/helpers/gamma-fixtures";

describe("markets API", () => {
  test("serves an empty cached category without contacting Gamma", async () => {
    const user = userRepository.createUser({
      username: "jules",
      passwordHash: "hashed"
    });
    const fetch = vi.spyOn(globalThis, "fetch");

    const response = await listMarkets(
      new Request("http://arena.test/api/markets?category=politics", {
        headers: { "x-test-user-id": user.id }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ events: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("serves cached markets for a valid category slug", async () => {
    const user = userRepository.createUser({
      username: "mira",
      passwordHash: "hashed"
    });
    marketCacheRepository.upsertCategoryEvents({
      category: "Politics",
      events: [
        normalizeGammaEvent(binaryGammaEvent(), {
          category: "Politics",
          lastSyncedAt: "2026-07-06T12:00:00.000Z"
        })
      ]
    });

    const response = await listMarkets(
      new Request("http://arena.test/api/markets?category=politics", {
        headers: { "x-test-user-id": user.id }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      events: [
        {
          gammaId: "event-election-2028",
          category: "Politics",
          title: "2028 Presidential Election",
          slug: "2028-presidential-election",
          volume: "1500000",
          lastSyncedAt: "2026-07-06T12:00:00.000Z",
          markets: [
            {
              gammaId: "market-democrat-win-2028",
              eventGammaId: "event-election-2028",
              eventTitle: "2028 Presidential Election",
              category: "Politics",
              question: "Will a Democrat win the 2028 US presidential election?",
              slug: "democrat-win-2028",
              outcomes: ["Yes", "No"],
              outcomePrices: ["0.63", "0.37"],
              bestBid: "0.62",
              bestAsk: "0.64",
              lastTradePrice: "0.63",
              active: true,
              closed: false,
              endDate: "2028-11-08T00:00:00.000Z",
              volume: "900000",
              lastSyncedAt: "2026-07-06T12:00:00.000Z"
            }
          ]
        }
      ]
    });
  });

  test("serves a cached market detail by Gamma market id", async () => {
    const user = userRepository.createUser({
      username: "detail-user",
      passwordHash: "hashed"
    });
    marketCacheRepository.upsertCategoryEvents({
      category: "Politics",
      events: [
        normalizeGammaEvent(binaryGammaEvent(), {
          category: "Politics",
          lastSyncedAt: "2026-07-06T12:00:00.000Z"
        })
      ]
    });

    const response = await getMarket(
      new Request("http://arena.test/api/markets/market-democrat-win-2028", {
        headers: { "x-test-user-id": user.id }
      }),
      { params: Promise.resolve({ marketId: "market-democrat-win-2028" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      market: {
        gammaId: "market-democrat-win-2028",
        eventTitle: "2028 Presidential Election",
        category: "Politics",
        bestBid: "0.62",
        bestAsk: "0.64",
        lastSyncedAt: "2026-07-06T12:00:00.000Z"
      }
    });
  });

  test("rejects invalid categories and anonymous callers without contacting Gamma", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const user = userRepository.createUser({
      username: "casey",
      passwordHash: "hashed"
    });

    const invalidCategory = await listMarkets(
      new Request("http://arena.test/api/markets?category=rumors", {
        headers: { "x-test-user-id": user.id }
      })
    );
    const anonymous = await listMarkets(
      new Request("http://arena.test/api/markets?category=politics")
    );

    expect(invalidCategory.status).toBe(400);
    await expect(invalidCategory.json()).resolves.toMatchObject({
      error: { code: "INVALID_CATEGORY" }
    });
    expect(anonymous.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
});
