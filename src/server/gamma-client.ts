import type { GammaEvent, GammaMarket } from "@/domain/markets";

export type GammaDiscoveryOptions = {
  active: boolean;
  closed: boolean;
  order: "volume";
  ascending: boolean;
  limit: number;
};

export type GammaRequestPurpose = "trade" | "cron" | "settlement";

export type GammaRequestOptions = {
  purpose?: GammaRequestPurpose;
};

export type GammaClient = {
  fetchEventsByTag(
    tagId: number,
    options: GammaDiscoveryOptions,
    requestOptions?: GammaRequestOptions
  ): Promise<GammaEvent[]>;
  fetchMarketById(gammaId: string, requestOptions?: GammaRequestOptions): Promise<GammaMarket>;
};

export class GammaRateLimitError extends Error {
  constructor(
    public readonly source: "local" | "remote",
    public readonly purpose: GammaRequestPurpose
  ) {
    super(source === "local" ? "GAMMA_RATE_LIMITED" : "GAMMA_REMOTE_RATE_LIMITED");
  }
}

type TokenBucketState = {
  tokens: number;
  lastRefillAtMs: number;
};

const GAMMA_API_BASE_URL =
  process.env.GAMMA_API_BASE_URL?.trim() || "https://gamma-api.polymarket.com";
const TOKEN_BUCKET_CAPACITY = 45;
const TOKEN_BUCKET_WINDOW_MS = 60_000;
const CRON_MAX_429_RETRIES = 2;
const CRON_BACKOFF_BASE_MS = 250;
const CRON_BACKOFF_JITTER_MS = 100;

const globalMemory = globalThis as typeof globalThis & {
  __arenaGammaTokenBucketState?: TokenBucketState;
};

let configuredSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let configuredRandom = () => Math.random();

function getTokenBucketState(nowMs: number): TokenBucketState {
  return (globalMemory.__arenaGammaTokenBucketState ??= {
    tokens: TOKEN_BUCKET_CAPACITY,
    lastRefillAtMs: nowMs
  });
}

function takeGammaToken(nowMs: number): boolean {
  const state = getTokenBucketState(nowMs);
  const elapsedMs = Math.max(0, nowMs - state.lastRefillAtMs);
  if (elapsedMs > 0) {
    const refilledTokens = (elapsedMs / TOKEN_BUCKET_WINDOW_MS) * TOKEN_BUCKET_CAPACITY;
    state.tokens = Math.min(TOKEN_BUCKET_CAPACITY, state.tokens + refilledTokens);
    state.lastRefillAtMs = nowMs;
  }

  if (state.tokens < 1) {
    return false;
  }

  state.tokens -= 1;
  return true;
}

function cronRetryDelayMs(attempt: number): number {
  return (
    CRON_BACKOFF_BASE_MS * 2 ** attempt +
    Math.floor(configuredRandom() * CRON_BACKOFF_JITTER_MS)
  );
}

async function fetchGammaJson<T>(input: {
  path: string;
  requestOptions?: GammaRequestOptions;
  parse: (body: unknown) => T;
  errorCode: string;
}): Promise<T> {
  const purpose = input.requestOptions?.purpose ?? "trade";

  for (let attempt = 0; ; attempt += 1) {
    if (!takeGammaToken(Date.now())) {
      throw new GammaRateLimitError("local", purpose);
    }

    const response = await fetch(new URL(input.path, GAMMA_API_BASE_URL));
    if (response.status === 429) {
      if (purpose === "cron" && attempt < CRON_MAX_429_RETRIES) {
        await configuredSleep(cronRetryDelayMs(attempt));
        continue;
      }

      throw new GammaRateLimitError("remote", purpose);
    }

    if (!response.ok) {
      throw new Error(input.errorCode);
    }

    return input.parse((await response.json()) as unknown);
  }
}

export const gammaClient: GammaClient = {
  async fetchEventsByTag(tagId, options, requestOptions) {
    const url = new URL("/events", GAMMA_API_BASE_URL);
    url.searchParams.set("tag_id", String(tagId));
    url.searchParams.set("active", String(options.active));
    url.searchParams.set("closed", String(options.closed));
    url.searchParams.set("order", options.order);
    url.searchParams.set("ascending", String(options.ascending));
    url.searchParams.set("limit", String(options.limit));

    return fetchGammaJson({
      path: `${url.pathname}${url.search}`,
      requestOptions,
      errorCode: "GAMMA_EVENTS_REQUEST_FAILED",
      parse(body) {
        if (!Array.isArray(body)) {
          throw new Error("INVALID_GAMMA_EVENTS_RESPONSE");
        }
        return body as GammaEvent[];
      }
    });
  },
  async fetchMarketById(gammaId, requestOptions) {
    return fetchGammaJson({
      path: `/markets/${gammaId}`,
      requestOptions,
      errorCode: "GAMMA_MARKET_REQUEST_FAILED",
      parse(body) {
        return body as GammaMarket;
      }
    });
  }
};

export function resetGammaRateLimiterForTesting(now = new Date()): void {
  globalMemory.__arenaGammaTokenBucketState = {
    tokens: TOKEN_BUCKET_CAPACITY,
    lastRefillAtMs: now.getTime()
  };
}

export function gammaRateLimiterSnapshotForTesting(): { tokens: number } {
  const state = getTokenBucketState(Date.now());
  return { tokens: state.tokens };
}

export function setGammaSleepForTesting(
  sleep: (ms: number) => Promise<void> | void
): void {
  configuredSleep = async (ms) => {
    await sleep(ms);
  };
}

export function resetGammaSleepForTesting(): void {
  configuredSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
}

export function setGammaRandomForTesting(random: () => number): void {
  configuredRandom = random;
}

export function resetGammaRandomForTesting(): void {
  configuredRandom = () => Math.random();
}

export const GAMMA_TESTING_CONSTANTS = {
  TOKEN_BUCKET_CAPACITY
} as const;
