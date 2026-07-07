export const MARKET_CATEGORIES = [
  "Politics",
  "Sports",
  "Crypto",
  "Esports",
  "Finance",
  "Tech",
  "Culture",
  "Weather",
  "Mentions"
] as const;

export type MarketCategory = (typeof MARKET_CATEGORIES)[number];

export type CategoryTag = {
  slug: string;
  tagId: number;
};

export const CATEGORY_TAGS: Record<MarketCategory, CategoryTag> = {
  Politics: { slug: "politics", tagId: 2 },
  Sports: { slug: "sports", tagId: 1 },
  Crypto: { slug: "crypto", tagId: 21 },
  Esports: { slug: "esports", tagId: 64 },
  Finance: { slug: "finance", tagId: 120 },
  Tech: { slug: "tech", tagId: 1401 },
  Culture: { slug: "pop-culture", tagId: 596 },
  Weather: { slug: "weather", tagId: 84 },
  Mentions: { slug: "mention-markets", tagId: 100343 }
};

export type GammaMarket = {
  id?: string | number;
  gammaId?: string | number;
  question?: string;
  slug?: string;
  outcomes?: unknown;
  outcomePrices?: unknown;
  bestBid?: unknown;
  bestAsk?: unknown;
  lastTradePrice?: unknown;
  active?: boolean;
  closed?: boolean;
  endDate?: string;
  endDateIso?: string;
  volume?: unknown;
};

export type GammaEvent = {
  id?: string | number;
  gammaId?: string | number;
  title?: string;
  slug?: string;
  volume?: unknown;
  markets?: GammaMarket[];
};

export type CachedMarket = {
  gammaId: string;
  eventGammaId: string;
  eventTitle: string;
  category: MarketCategory;
  question: string;
  slug: string;
  outcomes: string[];
  outcomePrices: string[];
  bestBid: string | null;
  bestAsk: string | null;
  lastTradePrice: string | null;
  active: boolean;
  closed: boolean;
  endDate: string | null;
  volume: string;
  lastSyncedAt: string;
};

export type CachedEvent = {
  gammaId: string;
  category: MarketCategory;
  title: string;
  slug: string;
  volume: string;
  lastSyncedAt: string;
  markets: CachedMarket[];
};

export function isMarketCategory(value: string): value is MarketCategory {
  return MARKET_CATEGORIES.includes(value as MarketCategory);
}

export function getCategoryTag(category: MarketCategory): CategoryTag {
  return CATEGORY_TAGS[category];
}

export function marketCategoryFromSlug(slug: string): MarketCategory {
  const category = MARKET_CATEGORIES.find((candidate) => CATEGORY_TAGS[candidate].slug === slug);
  if (!category) {
    throw new Error("INVALID_CATEGORY");
  }
  return category;
}

export function normalizeGammaEvent(
  event: GammaEvent,
  options: { category: MarketCategory; lastSyncedAt: string }
): CachedEvent {
  const eventGammaId = requiredString(event.gammaId ?? event.id, "EVENT_ID");
  const eventTitle = requiredString(event.title, "EVENT_TITLE");

  const markets: CachedMarket[] = [];
  for (const market of event.markets ?? []) {
    try {
      markets.push(
        normalizeGammaMarket(market, {
          eventGammaId,
          eventTitle,
          category: options.category,
          lastSyncedAt: options.lastSyncedAt
        })
      );
    } catch (error) {
      // Gamma includes placeholder/no-liquidity markets (e.g. long-tail
      // nomination candidates) that never got prices or outcomes assigned.
      // Skip just that market rather than losing the whole event/category.
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `Skipping unnormalizable Gamma market ${String(market.gammaId ?? market.id)} in event ${eventGammaId}: ${reason}`
      );
    }
  }

  return {
    gammaId: eventGammaId,
    category: options.category,
    title: eventTitle,
    slug: requiredString(event.slug, "EVENT_SLUG"),
    volume: normalizeNonNegativeDecimal(event.volume ?? "0", "INVALID_VOLUME"),
    lastSyncedAt: options.lastSyncedAt,
    markets
  };
}

export function normalizeGammaMarket(
  market: GammaMarket,
  options: {
    eventGammaId: string;
    eventTitle: string;
    category: MarketCategory;
    lastSyncedAt: string;
  }
): CachedMarket {
  return {
    gammaId: requiredString(market.gammaId ?? market.id, "MARKET_ID"),
    eventGammaId: options.eventGammaId,
    eventTitle: options.eventTitle,
    category: options.category,
    question: requiredString(market.question, "MARKET_QUESTION"),
    slug: requiredString(market.slug, "MARKET_SLUG"),
    outcomes: parseStringArray(market.outcomes, "INVALID_OUTCOMES"),
    outcomePrices: parseStringArray(market.outcomePrices, "INVALID_OUTCOME_PRICES").map((price) =>
      normalizePrice(price)
    ),
    bestBid: normalizeNullablePrice(market.bestBid),
    bestAsk: normalizeNullablePrice(market.bestAsk),
    lastTradePrice: normalizeNullablePrice(market.lastTradePrice),
    active: market.active === true,
    closed: market.closed === true,
    endDate: market.endDateIso ?? market.endDate ?? null,
    volume: normalizeNonNegativeDecimal(market.volume ?? "0", "INVALID_VOLUME"),
    lastSyncedAt: options.lastSyncedAt
  };
}

export function normalizePrice(value: unknown): string {
  const normalized = normalizeNonNegativeDecimal(value, "INVALID_PRICE");
  if (compareDecimalStrings(normalized, "1") > 0) {
    throw new Error("INVALID_PRICE");
  }
  return normalized;
}

export function parseStringArray(value: unknown, errorCode: string): string[] {
  const parsed = typeof value === "string" ? parseJsonArray(value) : value;
  if (!Array.isArray(parsed)) {
    throw new Error(errorCode);
  }

  return parsed.map((item) => requiredString(item, errorCode));
}

function normalizeNullablePrice(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return normalizePrice(value);
}

function parseJsonArray(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[")) {
    return value;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error("INVALID_JSON_ARRAY");
  }
}

function requiredString(value: unknown, errorCode: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(errorCode);
  }
  return value;
}

function normalizeNonNegativeDecimal(value: unknown, errorCode: string): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(errorCode);
  }

  const raw = typeof value === "number" ? String(value) : value;
  if (typeof raw !== "string") {
    throw new Error(errorCode);
  }

  const trimmed = raw.trim();
  if (!/^(?:\d+|\d*\.\d+)$/.test(trimmed)) {
    throw new Error(errorCode);
  }

  const withLeadingZero = trimmed.startsWith(".") ? `0${trimmed}` : trimmed;
  const [integerPart, fractionPart = ""] = withLeadingZero.split(".");
  const integer = integerPart.replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionPart.replace(/0+$/, "");
  return fraction.length > 0 ? `${integer}.${fraction}` : integer;
}

function compareDecimalStrings(left: string, right: string): number {
  const leftParts = toComparableParts(left);
  const rightParts = toComparableParts(right);
  const scale = Math.max(leftParts.scale, rightParts.scale);
  const leftValue = leftParts.value * 10n ** BigInt(scale - leftParts.scale);
  const rightValue = rightParts.value * 10n ** BigInt(scale - rightParts.scale);

  if (leftValue === rightValue) {
    return 0;
  }
  return leftValue > rightValue ? 1 : -1;
}

function toComparableParts(value: string): { value: bigint; scale: number } {
  const [integerPart, fractionPart = ""] = value.split(".");
  return {
    value: BigInt(`${integerPart}${fractionPart}`),
    scale: fractionPart.length
  };
}
