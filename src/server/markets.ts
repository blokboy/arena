import {
  MARKET_CATEGORIES,
  getCategoryTag,
  normalizeGammaEvent,
  normalizeGammaMarket,
  type CachedEvent,
  type CachedMarket,
  type GammaEvent,
  type GammaMarket,
  type MarketCategory
} from "@/domain/markets";
import { prisma, shouldUseRealDatabase } from "@/server/db";

export type GammaDiscoveryOptions = {
  active: boolean;
  closed: boolean;
  order: "volume";
  ascending: boolean;
  limit: number;
};

export type GammaClient = {
  fetchEventsByTag(tagId: number, options: GammaDiscoveryOptions): Promise<GammaEvent[]>;
  fetchMarketById(gammaId: string): Promise<GammaMarket>;
};

export type MarketCacheRepository = {
  upsertCategoryEvents(input: { category: MarketCategory; events: CachedEvent[] }): Promise<void>;
  listEventsByCategory(category: MarketCategory): Promise<CachedEvent[]>;
  findMarketByGammaId(gammaId: string): Promise<CachedMarket | undefined>;
  upsertMarket(market: CachedMarket): Promise<void>;
  clear(): Promise<void>;
};

type MemoryMarketCacheState = {
  eventsByCategory: Map<MarketCategory, CachedEvent[]>;
};

function createMemoryMarketCacheState(): MemoryMarketCacheState {
  return {
    eventsByCategory: new Map()
  };
}

export function createMemoryMarketCacheRepository(
  state = createMemoryMarketCacheState()
): MarketCacheRepository {
  return {
    async upsertCategoryEvents(input) {
      state.eventsByCategory.set(
        input.category,
        input.events.map((event) => ({
          ...event,
          markets: event.markets.map((market) => ({ ...market }))
        }))
      );
    },
    async listEventsByCategory(category) {
      return (state.eventsByCategory.get(category) ?? []).map((event) => ({
        ...event,
        markets: event.markets.map((market) => ({ ...market }))
      }));
    },
    async findMarketByGammaId(gammaId) {
      for (const events of state.eventsByCategory.values()) {
        for (const event of events) {
          const market = event.markets.find((candidate) => candidate.gammaId === gammaId);
          if (market) {
            return { ...market };
          }
        }
      }
      return undefined;
    },
    async upsertMarket(market) {
      for (const events of state.eventsByCategory.values()) {
        for (const event of events) {
          const index = event.markets.findIndex(
            (candidate) => candidate.gammaId === market.gammaId
          );
          if (index !== -1) {
            event.markets[index] = { ...market };
            return;
          }
        }
      }
    },
    async clear() {
      state.eventsByCategory.clear();
    }
  };
}

type PrismaCachedEventRow = {
  gammaId: string;
  category: string;
  title: string;
  slug: string;
  volume: { toString(): string };
  lastSyncedAt: Date;
};

type PrismaCachedMarketRow = {
  gammaId: string;
  question: string;
  slug: string;
  outcomes: unknown;
  outcomePrices: unknown;
  bestBid: { toString(): string } | null;
  bestAsk: { toString(): string } | null;
  lastTradePrice: { toString(): string } | null;
  active: boolean;
  closed: boolean;
  endDate: Date | null;
  volume: { toString(): string };
  lastSyncedAt: Date;
};

function toDomainMarket(row: PrismaCachedMarketRow, event: PrismaCachedEventRow): CachedMarket {
  return {
    gammaId: row.gammaId,
    eventGammaId: event.gammaId,
    eventTitle: event.title,
    category: event.category as MarketCategory,
    question: row.question,
    slug: row.slug,
    outcomes: row.outcomes as string[],
    outcomePrices: row.outcomePrices as string[],
    bestBid: row.bestBid ? row.bestBid.toString() : null,
    bestAsk: row.bestAsk ? row.bestAsk.toString() : null,
    lastTradePrice: row.lastTradePrice ? row.lastTradePrice.toString() : null,
    active: row.active,
    closed: row.closed,
    endDate: row.endDate ? row.endDate.toISOString() : null,
    volume: row.volume.toString(),
    lastSyncedAt: row.lastSyncedAt.toISOString()
  };
}

function toDomainEvent(
  row: PrismaCachedEventRow & { markets: PrismaCachedMarketRow[] }
): CachedEvent {
  return {
    gammaId: row.gammaId,
    category: row.category as MarketCategory,
    title: row.title,
    slug: row.slug,
    volume: row.volume.toString(),
    lastSyncedAt: row.lastSyncedAt.toISOString(),
    markets: row.markets.map((market) => toDomainMarket(market, row))
  };
}

function marketWriteData(market: CachedMarket, eventId: string) {
  return {
    eventId,
    question: market.question,
    slug: market.slug,
    outcomes: market.outcomes,
    outcomePrices: market.outcomePrices,
    bestBid: market.bestBid,
    bestAsk: market.bestAsk,
    lastTradePrice: market.lastTradePrice,
    active: market.active,
    closed: market.closed,
    endDate: market.endDate ? new Date(market.endDate) : null,
    volume: market.volume,
    lastSyncedAt: new Date(market.lastSyncedAt)
  };
}

export function createPrismaMarketCacheRepository(): MarketCacheRepository {
  return {
    async upsertCategoryEvents(input) {
      for (const event of input.events) {
        const eventRow = await prisma.cachedEvent.upsert({
          where: { gammaId: event.gammaId },
          create: {
            gammaId: event.gammaId,
            category: event.category,
            title: event.title,
            slug: event.slug,
            volume: event.volume,
            lastSyncedAt: new Date(event.lastSyncedAt)
          },
          update: {
            category: event.category,
            title: event.title,
            slug: event.slug,
            volume: event.volume,
            lastSyncedAt: new Date(event.lastSyncedAt)
          }
        });

        for (const market of event.markets) {
          const data = marketWriteData(market, eventRow.id);
          await prisma.cachedMarket.upsert({
            where: { gammaId: market.gammaId },
            create: { gammaId: market.gammaId, ...data },
            update: data
          });
        }
      }
    },
    async listEventsByCategory(category) {
      const rows = await prisma.cachedEvent.findMany({
        where: { category },
        include: { markets: true }
      });
      return rows.map(toDomainEvent);
    },
    async findMarketByGammaId(gammaId) {
      const row = await prisma.cachedMarket.findUnique({
        where: { gammaId },
        include: { event: true }
      });
      return row ? toDomainMarket(row, row.event) : undefined;
    },
    async upsertMarket(market) {
      const eventRow = await prisma.cachedEvent.findUnique({
        where: { gammaId: market.eventGammaId }
      });
      if (!eventRow) {
        throw new Error("CACHED_EVENT_NOT_FOUND");
      }

      const data = marketWriteData(market, eventRow.id);
      await prisma.cachedMarket.upsert({
        where: { gammaId: market.gammaId },
        create: { gammaId: market.gammaId, ...data },
        update: data
      });
    },
    async clear() {
      await prisma.cachedMarket.deleteMany();
      await prisma.cachedEvent.deleteMany();
    }
  };
}

const globalMemory = globalThis as typeof globalThis & {
  __arenaMarketCacheRepositoryState?: MemoryMarketCacheState;
  __arenaMarketCacheRepository?: MarketCacheRepository;
};

export const marketCacheRepository = (globalMemory.__arenaMarketCacheRepository ??=
  shouldUseRealDatabase()
    ? createPrismaMarketCacheRepository()
    : createMemoryMarketCacheRepository(
        (globalMemory.__arenaMarketCacheRepositoryState ??= createMemoryMarketCacheState())
      ));

export const TOP_VOLUME_MARKET_DISCOVERY: GammaDiscoveryOptions = {
  active: true,
  closed: false,
  order: "volume",
  ascending: false,
  limit: 10
};

const GAMMA_API_BASE_URL = "https://gamma-api.polymarket.com";

export const gammaClient: GammaClient = {
  async fetchEventsByTag(tagId, options) {
    const url = new URL("/events", GAMMA_API_BASE_URL);
    url.searchParams.set("tag_id", String(tagId));
    url.searchParams.set("active", String(options.active));
    url.searchParams.set("closed", String(options.closed));
    url.searchParams.set("order", options.order);
    url.searchParams.set("ascending", String(options.ascending));
    url.searchParams.set("limit", String(options.limit));

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("GAMMA_EVENTS_REQUEST_FAILED");
    }

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) {
      throw new Error("INVALID_GAMMA_EVENTS_RESPONSE");
    }
    return body as GammaEvent[];
  },
  async fetchMarketById(gammaId) {
    const url = new URL(`/markets/${gammaId}`, GAMMA_API_BASE_URL);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("GAMMA_MARKET_REQUEST_FAILED");
    }
    return (await response.json()) as GammaMarket;
  }
};

let configuredGammaClient: GammaClient = gammaClient;

export function setMarketGammaClientForTesting(client: GammaClient) {
  configuredGammaClient = client;
}

export function resetMarketGammaClientForTesting() {
  configuredGammaClient = gammaClient;
}

export async function syncMarketCategory(input: {
  category: MarketCategory;
  gammaClient?: GammaClient;
  now: Date;
  repository?: MarketCacheRepository;
}) {
  const repository = input.repository ?? marketCacheRepository;
  const client = input.gammaClient ?? configuredGammaClient;
  const events = await client.fetchEventsByTag(getCategoryTag(input.category).tagId, {
    ...TOP_VOLUME_MARKET_DISCOVERY
  });

  await repository.upsertCategoryEvents({
    category: input.category,
    events: events.map((event) =>
      normalizeGammaEvent(event, {
        category: input.category,
        lastSyncedAt: input.now.toISOString()
      })
    )
  });
}

export async function syncAllMarketCategories(input: {
  gammaClient?: GammaClient;
  now: Date;
  repository?: MarketCacheRepository;
}) {
  const syncedCategories: MarketCategory[] = [];

  for (const category of MARKET_CATEGORIES) {
    await syncMarketCategory({
      category,
      gammaClient: input.gammaClient,
      now: input.now,
      repository: input.repository
    });
    syncedCategories.push(category);
  }

  return { syncedCategories };
}

// PRD Part III §3, item 2: a 2-min/daily cron can't keep an actively-traded
// market's price fresh on its own, so buy/sell execution and the
// single-market read route refresh on demand instead, gated by this TTL —
// this is what actually decouples per-market freshness from the cron
// cadence (see docs/prds/points-prediction-market.md).
const MARKET_REFRESH_TTL_MS = 5_000;

export async function refreshMarketIfStale(input: {
  market: CachedMarket;
  now: Date;
  gammaClient?: GammaClient;
  repository?: MarketCacheRepository;
}): Promise<CachedMarket> {
  const ageMs = input.now.getTime() - new Date(input.market.lastSyncedAt).getTime();
  if (ageMs < MARKET_REFRESH_TTL_MS) {
    return input.market;
  }

  const repository = input.repository ?? marketCacheRepository;
  const client = input.gammaClient ?? configuredGammaClient;

  let gammaMarket: GammaMarket;
  try {
    gammaMarket = await client.fetchMarketById(input.market.gammaId);
  } catch {
    // Serve the last-cached price rather than failing the read/trade
    // (PRD Part III §6.3: graceful degradation over hard failure).
    return input.market;
  }

  const refreshed = normalizeGammaMarket(gammaMarket, {
    eventGammaId: input.market.eventGammaId,
    eventTitle: input.market.eventTitle,
    category: input.market.category,
    lastSyncedAt: input.now.toISOString()
  });

  await repository.upsertMarket(refreshed);
  return refreshed;
}
