import { describe, expect, test, vi } from "vitest";

import { GET as syncMarkets } from "@/app/api/cron/markets/route";
import { MARKET_CATEGORIES } from "@/domain/markets";
import { marketCacheRepository, setMarketGammaClientForTesting } from "@/server/markets";
import { binaryGammaEvent } from "@test/helpers/gamma-fixtures";

describe("market sync cron API", () => {
  test("rejects requests without the cron bearer secret", async () => {
    process.env.CRON_SECRET = "cron-secret";

    const response = await syncMarkets(new Request("http://arena.test/api/cron/markets"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: "UNAUTHORIZED_CRON" }
    });
  });

  test("syncs every curated market category with Vercel's CRON_SECRET authorization header", async () => {
    process.env.CRON_SECRET = "cron-secret";
    // Each category gets its own distinct event/market gammaId — a real
    // Gamma event belongs to exactly one of our curated categories
    // (CachedEvent.category is a scalar column, not a multi-category set),
    // so reusing one fixture's gammaId across all 9 calls would just
    // overwrite the same row's category 9 times instead of producing 9
    // independently-cached events.
    const gammaClient = {
      fetchEventsByTag: vi.fn().mockImplementation((tagId: number) => {
        const event = binaryGammaEvent();
        event.id = `event-tag-${tagId}`;
        event.markets = [{ ...event.markets?.[0], id: `market-tag-${tagId}` }];
        return Promise.resolve([event]);
      }),
      fetchMarketById: vi.fn()
    };
    setMarketGammaClientForTesting(gammaClient);

    const response = await syncMarkets(
      new Request("http://arena.test/api/cron/markets", {
        headers: { authorization: "Bearer cron-secret" }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      syncedCategories: MARKET_CATEGORIES
    });
    expect(gammaClient.fetchEventsByTag).toHaveBeenCalledTimes(MARKET_CATEGORIES.length);
    for (const category of MARKET_CATEGORIES) {
      expect(await marketCacheRepository.listEventsByCategory(category)).toHaveLength(1);
    }
  });
});
