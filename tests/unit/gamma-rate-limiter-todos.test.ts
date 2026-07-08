import fs from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { HttpResponse, http } from "msw";

import { binaryGammaEvent, resolvedBinaryGammaMarket } from "@test/helpers/gamma-fixtures";
import { normalizeGammaEvent, type GammaMarket } from "../../src/domain/markets";
import {
  GAMMA_TESTING_CONSTANTS,
  GammaRateLimitError,
  gammaClient,
  gammaRateLimiterSnapshotForTesting,
  resetGammaRateLimiterForTesting
} from "../../src/server/gamma-client";
import {
  marketCacheRepository,
  refreshMarketIfStale,
  resetGammaRandomForTesting,
  resetGammaSleepForTesting,
  setGammaRandomForTesting,
  setGammaSleepForTesting,
  syncAllMarketCategories
} from "../../src/server/markets";
import { refreshOpenPositionMarkets } from "../../src/server/settlement";
import { gammaRateLimited, GAMMA_BASE_URL } from "../../test/helpers/gamma/handlers";
import { gammaServer } from "../../test/helpers/gamma/server";

beforeAll(() => gammaServer.listen({ onUnhandledRequest: "error" }));
afterEach(async () => {
  gammaServer.resetHandlers();
  resetGammaRateLimiterForTesting(new Date("2026-01-15T12:00:00.000Z"));
  resetGammaSleepForTesting();
  resetGammaRandomForTesting();
  await marketCacheRepository.clear();
  vi.restoreAllMocks();
});
afterAll(() => gammaServer.close());

async function seedCachedPoliticsEvent(
  marketOverrides: Partial<GammaMarket> = {},
  lastSyncedAt = "2026-01-15T11:00:00.000Z"
) {
  const event = binaryGammaEvent();
  event.markets = [{ ...event.markets?.[0], ...marketOverrides }];
  await marketCacheRepository.upsertCategoryEvents({
    category: "Politics",
    events: [
      normalizeGammaEvent(event, {
        category: "Politics",
        lastSyncedAt
      })
    ]
  });
}

describe("two-tier cache (server-side Gamma client)", () => {
  it("browse reads (/api/markets) are served from the cache only — zero Gamma calls per client request", async () => {
    await seedCachedPoliticsEvent();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const events = await marketCacheRepository.listEventsByCategory("Politics");

    expect(events).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("category sync upserts events/markets from the 9 discovery queries (9 requests per tick)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await syncAllMarketCategories({
      now: new Date("2026-01-15T12:00:00.000Z"),
      gammaClient
    });

    expect(result.syncedCategories).toHaveLength(9);
    expect(fetchSpy).toHaveBeenCalledTimes(9);
    expect(await marketCacheRepository.listEventsByCategory("Politics")).toHaveLength(1);
    expect(await marketCacheRepository.listEventsByCategory("Sports")).toHaveLength(0);
  });

  it("trade-time refresh skips Gamma when lastSyncedAt is within the 5s TTL", async () => {
    const now = new Date("2026-01-15T12:00:00.000Z");
    await seedCachedPoliticsEvent({}, now.toISOString());
    const cached = await marketCacheRepository.findMarketByGammaId("market-democrat-win-2028");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const refreshed = await refreshMarketIfStale({
      market: cached!,
      now,
      repository: marketCacheRepository,
      gammaClient
    });

    expect(refreshed.lastSyncedAt).toBe(now.toISOString());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("trade-time refresh hits Gamma exactly once when the TTL has expired, then updates lastSyncedAt", async () => {
    const now = new Date("2026-01-15T12:00:00.000Z");
    await seedCachedPoliticsEvent({}, "2026-01-15T11:59:00.000Z");
    const cached = await marketCacheRepository.findMarketByGammaId("market-democrat-win-2028");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const refreshed = await refreshMarketIfStale({
      market: cached!,
      now,
      repository: marketCacheRepository,
      gammaClient
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(refreshed.lastSyncedAt).toBe(now.toISOString());
  });

  it("concurrent trade-time refreshes on the same hot market collapse to a single Gamma call", async () => {
    const now = new Date("2026-01-15T12:00:00.000Z");
    await seedCachedPoliticsEvent({}, "2026-01-15T11:59:00.000Z");
    const cached = await marketCacheRepository.findMarketByGammaId("market-democrat-win-2028");
    let calls = 0;
    const client = {
      fetchEventsByTag: vi.fn(),
      fetchMarketById: vi.fn().mockImplementation(async () => {
        calls += 1;
        await Promise.resolve();
        return binaryGammaEvent().markets?.[0]!;
      })
    };

    const [first, second] = await Promise.all([
      refreshMarketIfStale({
        market: cached!,
        now,
        repository: marketCacheRepository,
        gammaClient: client
      }),
      refreshMarketIfStale({
        market: cached!,
        now,
        repository: marketCacheRepository,
        gammaClient: client
      })
    ]);

    expect(calls).toBe(1);
    expect(first.lastSyncedAt).toBe(now.toISOString());
    expect(second.lastSyncedAt).toBe(now.toISOString());
  });
});

describe("rate limiter + degradation (PRD §6.3)", () => {
  it("outbound Gamma calls are capped by the token bucket (budget ~45/min, headroom for cron)", async () => {
    for (let attempt = 0; attempt < GAMMA_TESTING_CONSTANTS.TOKEN_BUCKET_CAPACITY; attempt += 1) {
      await gammaClient.fetchMarketById("500001");
    }

    expect(gammaRateLimiterSnapshotForTesting().tokens).toBeLessThan(1);
    await expect(gammaClient.fetchMarketById("500001")).rejects.toBeInstanceOf(GammaRateLimitError);
  });

  it("a limiter-skipped trade-time refresh serves the last-cached price with its lastSyncedAt — never fails the trade", async () => {
    const now = new Date("2026-01-15T12:00:00.000Z");
    await seedCachedPoliticsEvent({}, "2026-01-15T11:59:00.000Z");
    const cached = await marketCacheRepository.findMarketByGammaId("market-democrat-win-2028");

    for (let attempt = 0; attempt < GAMMA_TESTING_CONSTANTS.TOKEN_BUCKET_CAPACITY; attempt += 1) {
      await gammaClient.fetchMarketById("500001");
    }

    const refreshed = await refreshMarketIfStale({
      market: cached!,
      now,
      repository: marketCacheRepository,
      gammaClient
    });

    expect(refreshed.lastSyncedAt).toBe("2026-01-15T11:59:00.000Z");
  });

  it("cron sync retries a 429 with exponential backoff + jitter for that market only, not the whole run", async () => {
    let politicsAttempts = 0;
    const sleepCalls: number[] = [];
    setGammaSleepForTesting((ms) => {
      sleepCalls.push(ms);
    });
    setGammaRandomForTesting(() => 0);
    gammaServer.use(
      http.get(`${GAMMA_BASE_URL}/events`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("tag_id") !== "2") {
          return HttpResponse.json([]);
        }

        politicsAttempts += 1;
        if (politicsAttempts === 1) {
          return new HttpResponse(null, { status: 429 });
        }

        return HttpResponse.json([binaryGammaEvent()]);
      })
    );

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await syncAllMarketCategories({
      now: new Date("2026-01-15T12:00:00.000Z"),
      gammaClient
    });

    expect(result.syncedCategories).toContain("Politics");
    expect(fetchSpy).toHaveBeenCalledTimes(10);
    expect(sleepCalls).toEqual([250]);
    expect(await marketCacheRepository.listEventsByCategory("Politics")).toHaveLength(1);
  });

  it("a Gamma 429 during settlement skips that market and continues the run", async () => {
    await seedCachedPoliticsEvent({}, "2026-01-15T11:59:00.000Z");
    await marketCacheRepository.upsertCategoryEvents({
      category: "Sports",
      events: [
        normalizeGammaEvent(
          {
            ...binaryGammaEvent(),
            id: "event-world-cup",
            markets: [
              {
                ...binaryGammaEvent().markets?.[0],
                id: "market-world-cup",
                question: "Will Brazil win the World Cup?"
              }
            ]
          },
          {
            category: "Sports",
            lastSyncedAt: "2026-01-15T11:59:00.000Z"
          }
        )
      ]
    });

    const client = {
      fetchEventsByTag: vi.fn(),
      fetchMarketById: vi.fn().mockImplementation(async (marketId: string) => {
        if (marketId === "market-world-cup") {
          throw new GammaRateLimitError("remote", "settlement");
        }
        return resolvedBinaryGammaMarket();
      })
    };

    const result = await refreshOpenPositionMarkets({
      marketIds: ["market-democrat-win-2028", "market-world-cup"],
      now: new Date("2026-01-15T12:00:00.000Z"),
      gammaClient: client
    });

    expect(result.skippedMarketIds).toEqual(["market-world-cup"]);
    expect(result.refreshedMarkets).toHaveLength(1);
    expect(result.refreshedMarkets[0]?.gammaId).toBe("market-democrat-win-2028");
  });
});

describe("proxy boundary", () => {
  it("no module other than the server-side Gamma client constructs gamma-api.polymarket.com URLs", () => {
    const srcRoot = path.resolve(process.cwd(), "src");
    const matches: string[] = [];

    function visit(currentPath: string) {
      for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          visit(fullPath);
          continue;
        }
        if (!entry.isFile() || !fullPath.endsWith(".ts")) {
          continue;
        }

        if (fs.readFileSync(fullPath, "utf8").includes("gamma-api.polymarket.com")) {
          matches.push(path.relative(process.cwd(), fullPath));
        }
      }
    }

    visit(srcRoot);
    expect(matches).toEqual(["src/server/gamma-client.ts"]);
  });
});
