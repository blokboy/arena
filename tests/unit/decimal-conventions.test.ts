/**
 * Points-economy numeric conventions (PRD Part III, numeric convention):
 * every points/price/shares field travels as a decimal STRING and all
 * arithmetic goes through src/domain/positions.ts's bigint-scaled decimal
 * helpers — never through JS floats. This is a ledger; rounding drift is
 * unacceptable. These tests pin the helpers' exact behavior so any future
 * swap (e.g. to Prisma.Decimal at the DB boundary) has a contract to meet.
 */
import { describe, expect, it } from "vitest";

import {
  addDecimalStrings,
  divideDecimalStrings,
  multiplyDecimalStrings,
  normalizeDecimal,
  subtractDecimalStrings
} from "../../src/domain/positions";

describe("no float drift", () => {
  it("adds 0.1 + 0.2 to exactly 0.3 (where float famously does not)", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the failure mode we are excluding
    expect(addDecimalStrings("0.1", "0.2")).toBe("0.3");
  });

  it("accumulates 1,000 stipend-sized increments without drift", () => {
    // Simulates repeated ledger credits: float drifts, the helpers must not.
    let balance = "0";
    for (let i = 0; i < 1000; i += 1) {
      balance = addDecimalStrings(balance, "0.01");
    }
    expect(balance).toBe("10");
  });

  it("keeps a debit/credit round trip exactly conservative", () => {
    // Ledger invariant: debiting a stake and crediting it back restores the
    // starting balance to the digit — no epsilon comparisons anywhere.
    const start = "1000";
    const stake = "123.456789";
    expect(addDecimalStrings(subtractDecimalStrings(start, stake), stake)).toBe(start);
  });
});

describe("guard rails", () => {
  it("refuses to produce a negative balance instead of going overdrawn", () => {
    expect(() => subtractDecimalStrings("10", "10.01")).toThrow("NEGATIVE_DECIMAL");
  });

  it("rejects malformed and signed inputs — money strings are unsigned decimals", () => {
    expect(() => normalizeDecimal("abc")).toThrow("INVALID_DECIMAL");
    expect(() => normalizeDecimal("-5")).toThrow("INVALID_DECIMAL");
    expect(() => normalizeDecimal("1e3")).toThrow("INVALID_DECIMAL");
  });

  it("rejects division by zero explicitly", () => {
    expect(() => divideDecimalStrings("1", "0")).toThrow("DIVIDE_BY_ZERO");
  });
});

describe("global division policy: truncate at 16 fraction digits", () => {
  // Division is the one operation that can produce non-terminating decimals;
  // the app fixes ONE global policy for it. Pinned here: 16 digits, truncated
  // toward zero — never rounded up, so payouts can't round in anyone's favor.
  it("truncates non-terminating quotients instead of rounding", () => {
    expect(divideDecimalStrings("1", "3")).toBe("0.3333333333333333");
    expect(divideDecimalStrings("2", "3")).toBe("0.6666666666666666");
  });

  it("keeps terminating quotients exact with trailing zeros trimmed", () => {
    expect(divideDecimalStrings("50", "0.5")).toBe("100");
    expect(multiplyDecimalStrings("0.25", "4")).toBe("1");
  });
});

describe("owned by the persistence layer once Prisma lands", () => {
  it.todo(
    "DB round-trip: decimal strings survive Postgres numeric read/write losslessly (integration tier)"
  );
  it.todo(
    "the domain decimal helpers are the only arithmetic path — no raw number math on balances"
  );
});
