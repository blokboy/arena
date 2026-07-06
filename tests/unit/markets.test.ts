import { describe, expect, it } from "vitest";

import {
  CATEGORY_TAGS,
  getCategoryTag,
  isMarketCategory,
  normalizeGammaEvent,
  normalizePrice
} from "../../src/domain/markets";
import { binaryGammaEvent, multiOutcomeGammaEvent } from "../../test/helpers/gamma-fixtures";

describe("market category mapping", () => {
  it("maps the curated PRD categories to Gamma tag ids", () => {
    expect(CATEGORY_TAGS).toEqual({
      Politics: { slug: "politics", tagId: 2 },
      Sports: { slug: "sports", tagId: 1 },
      Crypto: { slug: "crypto", tagId: 21 },
      Esports: { slug: "esports", tagId: 64 },
      Finance: { slug: "finance", tagId: 120 },
      Tech: { slug: "tech", tagId: 1401 },
      Culture: { slug: "pop-culture", tagId: 596 },
      Weather: { slug: "weather", tagId: 84 },
      Mentions: { slug: "mention-markets", tagId: 100343 }
    });

    expect(getCategoryTag("Finance")).toEqual({
      slug: "finance",
      tagId: 120
    });
    expect(isMarketCategory("Rumors")).toBe(false);
  });
});

describe("Gamma event parsing", () => {
  it("normalizes events and nested binary markets into the cached discovery shape", () => {
    const event = normalizeGammaEvent(binaryGammaEvent(), {
      category: "Politics",
      lastSyncedAt: "2026-07-06T12:00:00.000Z"
    });

    expect(event).toEqual({
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
          volume: "900000"
        }
      ]
    });
  });

  it("normalizes stringified multi-outcome arrays from Gamma", () => {
    const event = normalizeGammaEvent(multiOutcomeGammaEvent(), {
      category: "Sports",
      lastSyncedAt: "2026-07-06T12:00:00.000Z"
    });

    expect(event.markets[0]?.outcomes).toEqual(["France", "Brazil", "Japan"]);
    expect(event.markets[0]?.outcomePrices).toEqual(["0.45", "0.35", "0.2"]);
  });
});

describe("price normalization", () => {
  it("keeps finite probability prices as decimal strings", () => {
    expect(normalizePrice("0.6400")).toBe("0.64");
    expect(normalizePrice(1)).toBe("1");
    expect(normalizePrice(".25")).toBe("0.25");
    expect(normalizePrice("0")).toBe("0");
  });

  it("rejects missing, non-numeric, and out-of-range probability prices", () => {
    expect(() => normalizePrice(null)).toThrow("INVALID_PRICE");
    expect(() => normalizePrice("soon")).toThrow("INVALID_PRICE");
    expect(() => normalizePrice("-0.1")).toThrow("INVALID_PRICE");
    expect(() => normalizePrice("1.1")).toThrow("INVALID_PRICE");
  });
});
