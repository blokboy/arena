import { describe, expect, it } from "vitest";

import {
  castDaysParlayRolloverVote,
  claimDaysParlayLeg,
  createDaysParlay,
  settleDaysParlayFailure,
  settleDaysParlaySuccess,
  utcDayKey
} from "../../src/domain/days-parlay";

describe("utcDayKey", () => {
  it("uses the UTC calendar day instead of the viewer's local day", () => {
    expect(utcDayKey(new Date("2026-07-06T23:59:59.999Z"))).toBe("2026-07-06");
    expect(utcDayKey(new Date("2026-07-07T00:00:00.000Z"))).toBe("2026-07-07");
  });
});

describe("claimDaysParlayLeg", () => {
  it("claims a market at most once per UTC day and creates the first stake atomically", () => {
    const day = createDaysParlay("2026-07-06");

    const firstClaim = claimDaysParlayLeg(day, {
      backerId: "ada",
      committedPrincipal: 40,
      gammaId: "gamma-1",
      marketId: "market-1",
      resolvesAt: new Date("2026-07-06T16:00:00.000Z")
    });

    expect(firstClaim.ok).toBe(true);
    if (!firstClaim.ok) throw new Error(firstClaim.error.code);
    expect(firstClaim.parlay.legs).toHaveLength(1);
    expect(firstClaim.parlay.legs[0]?.stakes).toEqual([
      { userId: "ada", amount: 40, freshPrincipal: 40 }
    ]);

    const duplicateClaim = claimDaysParlayLeg(firstClaim.parlay, {
      backerId: "grace",
      committedPrincipal: 25,
      gammaId: "gamma-1",
      marketId: "market-1",
      resolvesAt: new Date("2026-07-06T18:00:00.000Z")
    });

    expect(duplicateClaim).toEqual({
      ok: false,
      error: { code: "MARKET_ALREADY_CLAIMED" }
    });

    const emptyStakeClaim = claimDaysParlayLeg(day, {
      backerId: "linus",
      committedPrincipal: 0,
      gammaId: "gamma-2",
      marketId: "market-2",
      resolvesAt: new Date("2026-07-06T18:00:00.000Z")
    });

    expect(emptyStakeClaim).toEqual({
      ok: false,
      error: { code: "INITIAL_STAKE_REQUIRED" }
    });
  });
});

describe("castDaysParlayRolloverVote", () => {
  it("allows one vote per backer across the day and passes by strict headcount majority", () => {
    const day = createDaysParlay("2026-07-06", {
      legs: [
        {
          gammaId: "gamma-1",
          id: "leg-1",
          marketId: "market-1",
          resolvesAt: new Date("2026-07-06T16:00:00.000Z"),
          stakes: [
            { amount: 90, freshPrincipal: 90, userId: "ada" },
            { amount: 10, freshPrincipal: 10, userId: "grace" },
            { amount: 5, freshPrincipal: 5, userId: "linus" }
          ],
          votes: []
        },
        {
          gammaId: "gamma-2",
          id: "leg-2",
          marketId: "market-2",
          resolvesAt: new Date("2026-07-06T18:00:00.000Z"),
          stakes: [{ amount: 20, freshPrincipal: 20, userId: "ada" }],
          votes: []
        }
      ]
    });

    const firstVote = castDaysParlayRolloverVote(day, {
      legId: "leg-1",
      userId: "ada"
    });

    expect(firstVote.ok).toBe(true);
    if (!firstVote.ok) throw new Error(firstVote.error.code);
    expect(firstVote.didExecuteRollover).toBe(false);
    expect(firstVote.tally).toEqual({ yesCount: 1, totalBackerCount: 3 });

    const secondVote = castDaysParlayRolloverVote(firstVote.parlay, {
      legId: "leg-1",
      userId: "grace"
    });

    expect(secondVote.ok).toBe(true);
    if (!secondVote.ok) throw new Error(secondVote.error.code);
    expect(secondVote.didExecuteRollover).toBe(true);
    expect(secondVote.parlay.rolloverCount).toBe(1);

    const crossLegVote = castDaysParlayRolloverVote(secondVote.parlay, {
      legId: "leg-2",
      userId: "ada"
    });

    expect(crossLegVote).toEqual({
      ok: false,
      error: {
        code: "VOTE_ALREADY_SPENT",
        details: { spentOnLegId: "leg-1" }
      }
    });
  });

  it("rejects successful rollover attempts after the daily cap of three", () => {
    const cappedDay = createDaysParlay("2026-07-06", {
      rolloverCount: 3,
      legs: [
        {
          gammaId: "gamma-1",
          id: "leg-1",
          marketId: "market-1",
          resolvesAt: new Date("2026-07-06T16:00:00.000Z"),
          stakes: [
            { amount: 10, freshPrincipal: 10, userId: "ada" },
            { amount: 10, freshPrincipal: 10, userId: "grace" }
          ],
          votes: []
        }
      ]
    });

    expect(castDaysParlayRolloverVote(cappedDay, { legId: "leg-1", userId: "ada" })).toEqual({
      ok: false,
      error: { code: "ROLLOVER_CAP_REACHED" }
    });
  });
});

describe("Day's Parlay settlement", () => {
  it("splits a successful HOUSE bonus by fresh committed principal only", () => {
    const day = createDaysParlay("2026-07-06", {
      legs: [
        {
          gammaId: "gamma-1",
          id: "leg-1",
          marketId: "market-1",
          resolvesAt: new Date("2026-07-06T16:00:00.000Z"),
          stakes: [
            { amount: 260, freshPrincipal: 100, userId: "ada" },
            { amount: 140, freshPrincipal: 300, userId: "grace" }
          ],
          votes: []
        }
      ]
    });

    expect(
      settleDaysParlaySuccess(day, {
        finalLegId: "leg-1",
        houseBalance: 1_000,
        winningStakeByUser: { ada: 260, grace: 140 }
      })
    ).toEqual({
      bonusPool: 500,
      houseDebit: 500,
      payoutsByUser: {
        ada: 385,
        grace: 515
      }
    });
  });

  it("transfers active and pending remaining stake to HOUSE when the chain fails", () => {
    const day = createDaysParlay("2026-07-06", {
      legs: [
        {
          gammaId: "gamma-1",
          id: "active-leg",
          marketId: "market-1",
          resolvesAt: new Date("2026-07-06T16:00:00.000Z"),
          stakes: [{ amount: 125, freshPrincipal: 125, userId: "ada" }],
          votes: []
        },
        {
          gammaId: "gamma-2",
          id: "pending-leg",
          marketId: "market-2",
          resolvesAt: new Date("2026-07-06T20:00:00.000Z"),
          stakes: [{ amount: 75, freshPrincipal: 75, userId: "grace" }],
          votes: []
        }
      ]
    });

    expect(settleDaysParlayFailure(day)).toEqual({
      houseCredit: 200,
      lostStakeByUser: {
        ada: 125,
        grace: 75
      }
    });
  });
});
