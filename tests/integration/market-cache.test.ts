import { describe, expect, test, vi } from "vitest";

import { CATEGORY_TAGS, MARKET_CATEGORIES, type MarketCategory } from "@/domain/markets";
import {
  createFileMarketCacheRepository,
  marketCacheRepository,
  syncAllMarketCategories,
  syncMarketCategory
} from "@/server/markets";
import { binaryGammaEvent } from "@test/helpers/gamma-fixtures";

describe("market cache sync", () => {
  test.each(MARKET_CATEGORIES)(
    "retrieves top 10 open %s events by volume through an injected Gamma client",
    async (category: MarketCategory) => {
      const gammaClient = {
        fetchEventsByTag: vi.fn().mockResolvedValue([binaryGammaEvent()])
      };

      await syncMarketCategory({
        category,
        gammaClient,
        now: new Date("2026-07-06T12:00:00.000Z")
      });

      expect(gammaClient.fetchEventsByTag).toHaveBeenCalledWith(CATEGORY_TAGS[category].tagId, {
        active: true,
        closed: false,
        order: "volume",
        ascending: false,
        limit: 10
      });
    }
  );

  test("syncs Gamma events for a category into the local browse cache", async () => {
    const gammaClient = {
      fetchEventsByTag: vi.fn().mockResolvedValue([binaryGammaEvent()])
    };

    await syncMarketCategory({
      category: "Politics",
      gammaClient,
      now: new Date("2026-07-06T12:00:00.000Z")
    });

    expect(marketCacheRepository.listEventsByCategory("Politics")).toMatchObject([
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
            bestBid: "0.62",
            bestAsk: "0.64",
            active: true,
            closed: false
          }
        ]
      }
    ]);
  });

  test("syncs all PRD categories into the local browse cache", async () => {
    const gammaClient = {
      fetchEventsByTag: vi.fn().mockResolvedValue([binaryGammaEvent()])
    };

    const result = await syncAllMarketCategories({
      gammaClient,
      now: new Date("2026-07-06T12:00:00.000Z")
    });

    expect(result.syncedCategories).toEqual(MARKET_CATEGORIES);
    expect(gammaClient.fetchEventsByTag).toHaveBeenCalledTimes(MARKET_CATEGORIES.length);
    for (const category of MARKET_CATEGORIES) {
      expect(marketCacheRepository.listEventsByCategory(category)).toHaveLength(1);
    }
  });

  test("can persist synced category events to a local cache file", async () => {
    const filePath = "/tmp/arena-market-cache-test.json";
    const repository = createFileMarketCacheRepository(filePath);
    repository.clear();
    const gammaClient = {
      fetchEventsByTag: vi.fn().mockResolvedValue([binaryGammaEvent()])
    };

    await syncMarketCategory({
      category: "Politics",
      gammaClient,
      now: new Date("2026-07-06T12:00:00.000Z"),
      repository
    });

    const reloadedRepository = createFileMarketCacheRepository(filePath);
    expect(reloadedRepository.listEventsByCategory("Politics")[0]?.gammaId).toBe(
      "event-election-2028"
    );
    repository.clear();
  });
});
