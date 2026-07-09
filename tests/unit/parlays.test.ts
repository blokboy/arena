import { describe, expect, it } from "vitest";

import {
  appendRegularParlayLeg,
  assertLegResolvesAfterActiveLeg,
  computeCommittedPrincipal,
  createRegularParlay,
  divideCommitDecimals,
  executeRegularParlayRollover,
  getChronologicalLegs,
  settleRegularParlayLoss,
  sumCommitDecimals,
  tallyMemberRolloverVote,
  validateCommitments
} from "../../src/domain/parlays";

const date = (iso: string) => new Date(iso);

describe("regular parlays", () => {
  it("creates an active parlay with a locked roster and atomic first leg stake", () => {
    const parlay = createRegularParlay({
      id: "parlay-1",
      name: "July ladder",
      creatorId: "alice",
      memberIds: ["alice", "bob"],
      firstLeg: {
        id: "leg-1",
        marketId: "market-1",
        outcomeId: "yes",
        endDate: date("2026-07-07T18:00:00.000Z"),
        gammaId: "gamma-1",
        firstStake: { userId: "alice", amount: 100 }
      }
    });

    expect(parlay.status).toBe("ACTIVE");
    expect(parlay.memberIds).toEqual(["alice", "bob"]);
    expect(Object.isFrozen(parlay.memberIds)).toBe(true);
    expect(parlay.legs).toEqual([
      expect.objectContaining({
        id: "leg-1",
        status: "ACTIVE",
        stakes: [{ userId: "alice", amount: 100 }]
      })
    ]);

    expect(() =>
      createRegularParlay({
        id: "parlay-2",
        name: "Empty shell",
        creatorId: "alice",
        memberIds: ["alice", "bob"],
        firstLeg: {
          id: "leg-1",
          marketId: "market-1",
          outcomeId: "yes",
          endDate: date("2026-07-07T18:00:00.000Z"),
          gammaId: "gamma-1",
          firstStake: { userId: "alice", amount: 0 }
        }
      })
    ).toThrow("FIRST_LEG_REQUIRES_STAKE");
  });

  it("rejects appending a leg that resolves before or at the active leg", () => {
    const parlay = createRegularParlay({
      id: "parlay-1",
      name: "July ladder",
      creatorId: "alice",
      memberIds: ["alice", "bob"],
      firstLeg: {
        id: "leg-1",
        marketId: "market-1",
        outcomeId: "yes",
        endDate: date("2026-07-07T18:00:00.000Z"),
        gammaId: "gamma-1",
        firstStake: { userId: "alice", amount: 100 }
      }
    });

    expect(() =>
      appendRegularParlayLeg(parlay, {
        id: "leg-2",
        marketId: "market-2",
        outcomeId: "no",
        endDate: date("2026-07-07T18:00:00.000Z"),
        gammaId: "gamma-2",
        firstStake: { userId: "bob", amount: 50 }
      })
    ).toThrow("LEG_APPEND_TOO_EARLY");
  });

  it("rejects an append whose market resolves before or at the active leg, with structured details", () => {
    let error: unknown;

    try {
      assertLegResolvesAfterActiveLeg(
        date("2028-11-08T00:00:00.000Z"),
        date("2028-11-07T00:00:00.000Z")
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: "LEG_APPEND_TOO_EARLY",
      details: {
        activeLegEndDate: "2028-11-08T00:00:00.000Z",
        attemptedMarketEndDate: "2028-11-07T00:00:00.000Z"
      }
    });
  });

  it("accepts an append whose market resolves strictly after the active leg", () => {
    expect(() =>
      assertLegResolvesAfterActiveLeg(
        date("2028-11-08T00:00:00.000Z"),
        date("2028-11-09T00:00:00.000Z")
      )
    ).not.toThrow();
  });

  it("returns legs in chronological order by end date then gamma id", () => {
    const sorted = getChronologicalLegs([
      {
        id: "later",
        marketId: "market-3",
        outcomeId: "yes",
        endDate: date("2026-07-09T18:00:00.000Z"),
        gammaId: "gamma-3",
        status: "PENDING",
        stakes: [{ userId: "alice", amount: 30 }]
      },
      {
        id: "tie-b",
        marketId: "market-2",
        outcomeId: "yes",
        endDate: date("2026-07-08T18:00:00.000Z"),
        gammaId: "gamma-b",
        status: "PENDING",
        stakes: [{ userId: "alice", amount: 20 }]
      },
      {
        id: "tie-a",
        marketId: "market-1",
        outcomeId: "yes",
        endDate: date("2026-07-08T18:00:00.000Z"),
        gammaId: "gamma-a",
        status: "PENDING",
        stakes: [{ userId: "alice", amount: 10 }]
      }
    ]);

    expect(sorted.map((leg) => leg.id)).toEqual(["tie-a", "tie-b", "later"]);
  });

  it("passes rollover only when formal-member yes stake is strictly greater than 50%", () => {
    const exactlyHalf = tallyMemberRolloverVote({
      memberIds: ["alice", "bob"],
      stakes: [
        { userId: "alice", amount: 50 },
        { userId: "bob", amount: 50 },
        { userId: "chris", amount: 900 }
      ],
      votes: { alice: true, chris: true }
    });

    expect(exactlyHalf).toEqual({
      totalMemberStake: 100,
      yesMemberStake: 50,
      passes: false,
      members: [
        { userId: "alice", amount: 50, sharePct: 0.5, votingYes: true },
        { userId: "bob", amount: 50, sharePct: 0.5, votingYes: false }
      ]
    });

    const overHalf = tallyMemberRolloverVote({
      memberIds: ["alice", "bob"],
      stakes: [
        { userId: "alice", amount: 51 },
        { userId: "bob", amount: 49 },
        { userId: "chris", amount: 900 }
      ],
      votes: { alice: true, chris: true }
    });

    expect(overHalf).toEqual({
      totalMemberStake: 100,
      yesMemberStake: 51,
      passes: true,
      members: [
        { userId: "alice", amount: 51, sharePct: 0.51, votingYes: true },
        { userId: "bob", amount: 49, sharePct: 0.49, votingYes: false }
      ]
    });
  });

  it("transfers all active and pending at-risk stake to HOUSE when a regular parlay loses", () => {
    const parlay = appendRegularParlayLeg(
      createRegularParlay({
        id: "parlay-1",
        name: "July ladder",
        creatorId: "alice",
        memberIds: ["alice", "bob"],
        firstLeg: {
          id: "leg-1",
          marketId: "market-1",
          outcomeId: "yes",
          endDate: date("2026-07-07T18:00:00.000Z"),
          gammaId: "gamma-1",
          firstStake: { userId: "alice", amount: 100 }
        }
      }),
      {
        id: "leg-2",
        marketId: "market-2",
        outcomeId: "no",
        endDate: date("2026-07-08T18:00:00.000Z"),
        gammaId: "gamma-2",
        firstStake: { userId: "bob", amount: 50 }
      }
    );

    const settled = settleRegularParlayLoss(parlay, "leg-1");

    expect(settled.parlay.status).toBe("LOST");
    expect(settled.houseTransaction).toEqual({
      type: "PARLAY_LEG_LOSS",
      amount: 150,
      parlayId: "parlay-1",
      legId: "leg-1"
    });
  });
});

describe("commitment validation", () => {
  const basePosition = {
    id: "pos-1",
    userId: "alice",
    marketId: "market-1",
    outcomeIndex: 0,
    shares: "100",
    committedShares: "30",
    stake: "200",
    status: "OPEN" as const
  };

  it("accepts valid commitments with sufficient available shares", () => {
    expect(() =>
      validateCommitments({
        commitments: [{ positionId: "pos-1", shares: "50" }],
        positions: [basePosition],
        userId: "alice",
        marketId: "market-1",
        outcomeIndex: 0
      })
    ).not.toThrow();
  });

  it("rejects empty commitments with NO_COMMITMENTS", () => {
    expect(() =>
      validateCommitments({
        commitments: [],
        positions: [basePosition],
        userId: "alice",
        marketId: "market-1",
        outcomeIndex: 0
      })
    ).toThrow("NO_COMMITMENTS");
  });

  it("rejects commitments exceeding available shares", () => {
    expect(() =>
      validateCommitments({
        commitments: [{ positionId: "pos-1", shares: "80" }],
        positions: [basePosition],
        userId: "alice",
        marketId: "market-1",
        outcomeIndex: 0
      })
    ).toThrow("INSUFFICIENT_AVAILABLE_SHARES");
  });

  it("rejects a position not owned by the caller", () => {
    expect(() =>
      validateCommitments({
        commitments: [{ positionId: "pos-1", shares: "10" }],
        positions: [basePosition],
        userId: "bob",
        marketId: "market-1",
        outcomeIndex: 0
      })
    ).toThrow("POSITION_NOT_OWNED");
  });

  it("rejects a position for the wrong market", () => {
    expect(() =>
      validateCommitments({
        commitments: [{ positionId: "pos-1", shares: "10" }],
        positions: [basePosition],
        userId: "alice",
        marketId: "market-2",
        outcomeIndex: 0
      })
    ).toThrow("POSITION_WRONG_MARKET");
  });

  it("rejects a position for the wrong outcome", () => {
    expect(() =>
      validateCommitments({
        commitments: [{ positionId: "pos-1", shares: "10" }],
        positions: [basePosition],
        userId: "alice",
        marketId: "market-1",
        outcomeIndex: 1
      })
    ).toThrow("POSITION_WRONG_OUTCOME");
  });

  it("rejects a position that is not OPEN", () => {
    expect(() =>
      validateCommitments({
        commitments: [{ positionId: "pos-1", shares: "10" }],
        positions: [{ ...basePosition, status: "SOLD" }],
        userId: "alice",
        marketId: "market-1",
        outcomeIndex: 0
      })
    ).toThrow("POSITION_NOT_OPEN");
  });

  it("rejects a non-existent position", () => {
    expect(() =>
      validateCommitments({
        commitments: [{ positionId: "pos-999", shares: "10" }],
        positions: [basePosition],
        userId: "alice",
        marketId: "market-1",
        outcomeIndex: 0
      })
    ).toThrow("POSITION_NOT_FOUND");
  });
});

describe("committed principal computation", () => {
  it("computes proportional principal from stake and shares", () => {
    const result = computeCommittedPrincipal({
      commitment: { positionId: "pos-1", shares: "50" },
      position: {
        id: "pos-1",
        userId: "alice",
        marketId: "m1",
        outcomeIndex: 0,
        shares: "100",
        committedShares: "0",
        stake: "200",
        status: "OPEN"
      }
    });
    expect(result).toBe("100");
  });

  it("computes correctly for fractional shares", () => {
    const result = computeCommittedPrincipal({
      commitment: { positionId: "pos-1", shares: "390.625" },
      position: {
        id: "pos-1",
        userId: "alice",
        marketId: "m1",
        outcomeIndex: 0,
        shares: "390.625",
        committedShares: "0",
        stake: "250",
        status: "OPEN"
      }
    });
    expect(result).toBe("250");
  });
});

describe("divideCommitDecimals", () => {
  it("divides two same-scale decimal strings", () => {
    expect(divideCommitDecimals("100", "50")).toBe("2");
  });

  it("aligns differing scales before dividing instead of dividing raw values", () => {
    // 10 / 100.5 ≈ 0.0995 — dividing the raw unaligned BigInt values (10n / 1005n)
    // would silently be off by a factor of the scale difference.
    expect(divideCommitDecimals("10", "100.5")).toBe("0.099502");
  });

  it("returns 0 when dividing by zero instead of throwing", () => {
    expect(divideCommitDecimals("50", "0")).toBe("0");
  });
});

describe("sumCommitDecimals", () => {
  it("sums string decimals correctly", () => {
    expect(sumCommitDecimals(["100", "50", "25"])).toBe("175");
  });

  it("returns 0 for empty array", () => {
    expect(sumCommitDecimals([])).toBe("0");
  });

  it("handles fractional values", () => {
    expect(sumCommitDecimals(["100.5", "50.25"])).toBe("150.75");
  });
});

describe("executeRegularParlayRollover", () => {
  const leg1 = {
    id: "leg-1",
    marketId: "market-1",
    outcomeId: "yes",
    endDate: new Date("2026-07-07T18:00:00.000Z"),
    gammaId: "gamma-1",
    status: "ACTIVE" as const,
    stakes: [{ userId: "alice", amount: 100 }, { userId: "bob", amount: 50 }]
  };
  const leg2 = {
    id: "leg-2",
    marketId: "market-2",
    outcomeId: "no",
    endDate: new Date("2026-07-08T18:00:00.000Z"),
    gammaId: "gamma-2",
    status: "PENDING" as const,
    stakes: [{ userId: "alice", amount: 0 }]
  };
  const legs = [leg1, leg2];

  it("computes rollforward from bestBid to next leg bestAsk for every backer", () => {
    const result = executeRegularParlayRollover({
      legs,
      legId: "leg-1",
      stakesWithShares: [
        { userId: "alice", shares: 100, amount: 100 },
        { userId: "bob", shares: 50, amount: 50 }
      ],
      bestBid: 0.6,
      nextLegBestAsk: 0.5,
      exitedAt: new Date("2026-07-07T19:00:00.000Z")
    });

    expect(result.currentLegId).toBe("leg-1");
    expect(result.nextLegId).toBe("leg-2");
    // alice: 100 shares × 0.6 = 60 → 60 / 0.5 = 120 shares
    // bob: 50 shares × 0.6 = 30 → 30 / 0.5 = 60 shares
    expect(result.rollForwardByUser).toEqual({
      alice: { shares: 120, amount: 60 },
      bob: { shares: 60, amount: 30 }
    });
  });

  it("returns no next leg when rolling over the final leg", () => {
    const result = executeRegularParlayRollover({
      legs: [leg1],
      legId: "leg-1",
      stakesWithShares: [
        { userId: "alice", shares: 100, amount: 100 }
      ],
      bestBid: 0.6,
      nextLegBestAsk: null,
      exitedAt: new Date("2026-07-07T19:00:00.000Z")
    });

    expect(result.nextLegId).toBeNull();
    expect(result.rollForwardByUser).toEqual({});
  });

  it("includes all backers including non-members in the rollforward", () => {
    const result = executeRegularParlayRollover({
      legs,
      legId: "leg-1",
      stakesWithShares: [
        { userId: "alice", shares: 100, amount: 100 },
        { userId: "chris", shares: 40, amount: 40 }
      ],
      bestBid: 0.5,
      nextLegBestAsk: 0.4,
      exitedAt: new Date("2026-07-07T19:00:00.000Z")
    });

    // alice: 100 × 0.5 = 50 → 50 / 0.4 = 125 shares
    // chris: 40 × 0.5 = 20 → 20 / 0.4 = 50 shares
    expect(result.rollForwardByUser).toEqual({
      alice: { shares: 125, amount: 50 },
      chris: { shares: 50, amount: 20 }
    });
  });

  it("throws LEG_NOT_FOUND for an unknown leg id", () => {
    expect(() =>
      executeRegularParlayRollover({
        legs,
        legId: "nonexistent",
        stakesWithShares: [{ userId: "alice", shares: 100, amount: 100 }],
        bestBid: 0.6,
        nextLegBestAsk: 0.5,
        exitedAt: new Date("2026-07-07T19:00:00.000Z")
      })
    ).toThrow("LEG_NOT_FOUND");
  });

  it("throws LEG_NOT_FOUND for a non-active leg", () => {
    expect(() =>
      executeRegularParlayRollover({
        legs,
        legId: "leg-2",
        stakesWithShares: [{ userId: "alice", shares: 100, amount: 100 }],
        bestBid: 0.6,
        nextLegBestAsk: 0.5,
        exitedAt: new Date("2026-07-07T19:00:00.000Z")
      })
    ).toThrow("LEG_NOT_FOUND");
  });
});
