/**
 * Single-market trading conventions (PRD Part I §4, Part III §5):
 *   - buy at bestAsk, sell at bestBid — the spread is real
 *   - shares = stake / entryPrice(bestAsk at buy time)
 *   - lastTradePrice is display-only; execution never uses it
 *
 * tests/unit/positions.test.ts covers the individual helpers; this suite
 * pins the cross-helper economics — a round trip through the spread always
 * loses — using the real calculateBuyQuote/calculateSellValue seams.
 */
import { describe, expect, it } from "vitest";

import { calculateBuyQuote, calculateSellValue } from "../../src/domain/positions";

describe("buy at bestAsk / sell at bestBid", () => {
  it("an instant round trip always costs the spread (no free round-trips)", () => {
    const quote = calculateBuyQuote({ stake: "100", bestAsk: "0.66" });
    // 100 / 0.66, truncated at the 16-digit division policy.
    expect(quote.shares).toBe("151.5151515151515151");

    const proceeds = calculateSellValue({ shares: quote.shares, bestBid: "0.64" });
    expect(proceeds).toBe("96.969696969696969664");
    expect(Number(proceeds)).toBeLessThan(Number(quote.stake));
  });

  it("execution prices are bestAsk (buy) and bestBid (sell) — never lastTradePrice", () => {
    // Convention pin: the quote seams take only ask/bid. A market whose
    // lastTradePrice sits outside the spread must not affect either leg.
    const quote = calculateBuyQuote({ stake: "50", bestAsk: "0.5" });
    expect(quote).toEqual({ stake: "50", price: "0.5", shares: "100" });
    expect(calculateSellValue({ shares: "100", bestBid: "0.4" })).toBe("40");
  });
});

describe("resolution settlement (prices collapse to 0/1)", () => {
  it("pays full value for the winning outcome and zero for the losing one", () => {
    const quote = calculateBuyQuote({ stake: "100", bestAsk: "0.4" }); // 250 shares
    expect(calculateSellValue({ shares: quote.shares, bestBid: "1" })).toBe("250");
    // calculateSellValue rejects a 0 price by design; losing lots are zeroed
    // by settlement (calculatePositionSettlement), covered in settlement.test.ts.
  });
});

describe("owned by the trading route/repository once it exists", () => {
  it.todo("rejects stake > balance with error.code INSUFFICIENT_BALANCE");
  it.todo("rejects buys on markets where active=false or closed=true");
  it.todo("each buy creates its own Position lot — repeat buys are never merged");
  it.todo("holding both outcomes of the same market simultaneously is allowed");
  it.todo("single-market losses do NOT credit HOUSE (parlay-only rule)");
});
