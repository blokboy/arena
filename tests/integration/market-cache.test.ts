import { describe, expect, test, vi } from "vitest";

import { CATEGORY_TAGS, MARKET_CATEGORIES, type MarketCategory } from "@/domain/markets";
import {
  createPrismaMarketCacheRepository,
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
        fetchEventsByTag: vi.fn().mockResolvedValue([binaryGammaEvent()]),
        fetchMarketById: vi.fn()
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
      fetchEventsByTag: vi.fn().mockResolvedValue([binaryGammaEvent()]),
      fetchMarketById: vi.fn()
    };

    await syncMarketCategory({
      category: "Politics",
      gammaClient,
      now: new Date("2026-07-06T12:00:00.000Z")
    });

    expect(await marketCacheRepository.listEventsByCategory("Politics")).toMatchObject([
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

    const result = await syncAllMarketCategories({
      gammaClient,
      now: new Date("2026-07-06T12:00:00.000Z")
    });

    expect(result.syncedCategories).toEqual(MARKET_CATEGORIES);
    expect(gammaClient.fetchEventsByTag).toHaveBeenCalledTimes(MARKET_CATEGORIES.length);
    for (const category of MARKET_CATEGORIES) {
      expect(await marketCacheRepository.listEventsByCategory(category)).toHaveLength(1);
    }
  });

  test("persists synced category events durably — a fresh repository instance against the same database sees them", async () => {
    const gammaClient = {
      fetchEventsByTag: vi.fn().mockResolvedValue([binaryGammaEvent()]),
      fetchMarketById: vi.fn()
    };

    await syncMarketCategory({
      category: "Politics",
      gammaClient,
      now: new Date("2026-07-06T12:00:00.000Z")
    });

    // A brand-new repository instance (no shared in-process state with the
    // one syncMarketCategory used above) still sees the synced data, because
    // both are backed by the same real Postgres database, not a per-process
    // cache.
    const freshRepository = createPrismaMarketCacheRepository();
    const events = await freshRepository.listEventsByCategory("Politics");
    expect(events[0]?.gammaId).toBe("event-election-2028");
  });
});
