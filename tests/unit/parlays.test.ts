import { describe, expect, it } from "vitest";

import {
  appendRegularParlayLeg,
  computeCommittedPrincipal,
  createRegularParlay,
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
      passes: false
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
      passes: true
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
      position: { id: "pos-1", userId: "alice", marketId: "m1", outcomeIndex: 0, shares: "100", committedShares: "0", stake: "200", status: "OPEN" }
    });
    expect(result).toBe("100");
  });

  it("computes correctly for fractional shares", () => {
    const result = computeCommittedPrincipal({
      commitment: { positionId: "pos-1", shares: "390.625" },
      position: { id: "pos-1", userId: "alice", marketId: "m1", outcomeIndex: 0, shares: "390.625", committedShares: "0", stake: "250", status: "OPEN" }
    });
    expect(result).toBe("250");
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
