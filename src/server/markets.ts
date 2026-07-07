import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  MARKET_CATEGORIES,
  getCategoryTag,
  normalizeGammaEvent,
  type CachedEvent,
  type CachedMarket,
  type GammaEvent,
  type MarketCategory
} from "@/domain/markets";

export type GammaDiscoveryOptions = {
  active: boolean;
  closed: boolean;
  order: "volume";
  ascending: boolean;
  limit: number;
};

export type GammaClient = {
  fetchEventsByTag(tagId: number, options: GammaDiscoveryOptions): Promise<GammaEvent[]>;
};

export type MarketCacheRepository = {
  upsertCategoryEvents(input: { category: MarketCategory; events: CachedEvent[] }): void;
  listEventsByCategory(category: MarketCategory): CachedEvent[];
  findMarketByGammaId(gammaId: string): CachedMarket | undefined;
  clear(): void;
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
    upsertCategoryEvents(input) {
      state.eventsByCategory.set(
        input.category,
        input.events.map((event) => ({
          ...event,
          markets: event.markets.map((market) => ({ ...market }))
        }))
      );
    },
    listEventsByCategory(category) {
      return (state.eventsByCategory.get(category) ?? []).map((event) => ({
        ...event,
        markets: event.markets.map((market) => ({ ...market }))
      }));
    },
    findMarketByGammaId(gammaId) {
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
    clear() {
      state.eventsByCategory.clear();
    }
  };
}

type SerializedMarketCacheState = {
  eventsByCategory: Partial<Record<MarketCategory, CachedEvent[]>>;
};

export function createFileMarketCacheRepository(filePath: string): MarketCacheRepository {
  const repository = createMemoryMarketCacheRepository(readMarketCacheFile(filePath));

  return {
    upsertCategoryEvents(input) {
      repository.upsertCategoryEvents(input);
      writeMarketCacheFile(filePath, repository);
    },
    listEventsByCategory(category) {
      return repository.listEventsByCategory(category);
    },
    findMarketByGammaId(gammaId) {
      return repository.findMarketByGammaId(gammaId);
    },
    clear() {
      repository.clear();
      if (existsSync(filePath)) {
        rmSync(filePath);
      }
    }
  };
}

function readMarketCacheFile(filePath: string): MemoryMarketCacheState {
  if (!existsSync(filePath)) {
    return createMemoryMarketCacheState();
  }

  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as SerializedMarketCacheState;
  return {
    eventsByCategory: new Map(
      Object.entries(parsed.eventsByCategory).map(([category, events]) => [
        category as MarketCategory,
        events ?? []
      ])
    )
  };
}

function writeMarketCacheFile(filePath: string, repository: MarketCacheRepository) {
  mkdirSync(dirname(filePath), { recursive: true });
  const eventsByCategory = Object.fromEntries(
    MARKET_CATEGORIES.map((category) => [category, repository.listEventsByCategory(category)])
  ) as SerializedMarketCacheState["eventsByCategory"];

  writeFileSync(filePath, JSON.stringify({ eventsByCategory }, null, 2));
}

const globalMemory = globalThis as typeof globalThis & {
  __arenaMarketCacheRepositoryState?: MemoryMarketCacheState;
  __arenaMarketCacheRepository?: MarketCacheRepository;
};

export const marketCacheRepository = (globalMemory.__arenaMarketCacheRepository ??=
  process.env.NODE_ENV === "test"
    ? createMemoryMarketCacheRepository(
        (globalMemory.__arenaMarketCacheRepositoryState ??= createMemoryMarketCacheState())
      )
    : createFileMarketCacheRepository(join(process.cwd(), ".arena-cache", "markets.json")));

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

  repository.upsertCategoryEvents({
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
