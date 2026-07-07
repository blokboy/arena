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
    const gammaClient = {
      fetchEventsByTag: vi.fn().mockResolvedValue([binaryGammaEvent()])
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
      expect(marketCacheRepository.listEventsByCategory(category)).toHaveLength(1);
    }
  });
});
