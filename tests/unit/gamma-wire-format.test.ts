/**
 * Raw Gamma wire-format tolerance.
 *
 * The hand-built objects in test/helpers/gamma-fixtures.ts describe the
 * shapes we WANT; the JSON files under test/fixtures/gamma/ are the shapes
 * the wire actually SENDS — outcomes/outcomePrices arrive as JSON-encoded
 * strings and prices arrive as numbers. This suite pins that the domain
 * normalizer accepts the recorded wire shape directly, so a future switch
 * to real recorded responses can never regress parsing.
 */
import { describe, expect, it } from "vitest";

import { normalizeGammaEvent, type GammaEvent } from "../../src/domain/markets";
import eventPolitics from "../../test/fixtures/gamma/event-politics.json";

describe("normalizeGammaEvent against a recorded wire-shaped event", () => {
  const normalized = normalizeGammaEvent(eventPolitics as GammaEvent, {
    category: "Politics",
    lastSyncedAt: "2026-01-15T12:00:00.000Z"
  });

  it("parses the event envelope", () => {
    expect(normalized).toMatchObject({
      gammaId: "900001",
      title: "2026 Election",
      slug: "2026-election",
      category: "Politics",
      volume: "1234567.89"
    });
    expect(normalized.markets).toHaveLength(1);
  });

  it("parses JSON-encoded outcomes/outcomePrices strings into arrays", () => {
    expect(normalized.markets[0]).toMatchObject({
      gammaId: "500001",
      question: "Will the incumbent win the 2026 election?",
      outcomes: ["Yes", "No"],
      outcomePrices: ["0.65", "0.35"]
    });
  });

  it("normalizes numeric wire prices into decimal strings", () => {
    expect(normalized.markets[0]).toMatchObject({
      bestBid: "0.64",
      bestAsk: "0.66",
      lastTradePrice: "0.65"
    });
  });
});
