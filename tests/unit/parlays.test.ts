import { describe, expect, it } from "vitest";

import {
  appendRegularParlayLeg,
  createRegularParlay,
  getChronologicalLegs,
  settleRegularParlayLoss,
  tallyMemberRolloverVote
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
