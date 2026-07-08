import { describe, expect, it } from "vitest";

import {
  ParlayCreationError,
  buildInitialRoster,
  validateFirstLegCommitments,
  validateParlayName,
  type EligiblePosition,
  type LegCommitment
} from "../../src/domain/parlay-creation";

// New, additive module for Issue #8 (create a regular parlay with a locked
// roster and an atomic first leg). This is separate from the existing
// src/domain/parlays.ts sketch, which models rollover/settlement over a
// simplified in-memory {userId, amount} stake shape — Issue #8's real
// commit path locks actual Position rows via {positionId, shares}, matching
// the relational schema (Position.committedShares, LegStakeSource,
// LegStake) described in the PRD's Part III.

describe("validateParlayName", () => {
  it("accepts a non-blank name", () => {
    expect(() => validateParlayName("July ladder")).not.toThrow();
  });

  it.each(["", "   ", "\t\n"])("rejects a blank name (%j)", (name) => {
    expect(() => validateParlayName(name)).toThrow("PARLAY_NAME_REQUIRED");
  });

  it("throws a ParlayCreationError with a stable code", () => {
    try {
      validateParlayName("");
      expect.unreachable("expected validateParlayName to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ParlayCreationError);
      expect((error as ParlayCreationError).code).toBe("PARLAY_NAME_REQUIRED");
    }
  });
});

describe("buildInitialRoster", () => {
  it("always includes the creator, even if omitted from inviteUserIds", () => {
    expect(buildInitialRoster({ creatorId: "alice", inviteUserIds: ["bob"] })).toEqual([
      "alice",
      "bob"
    ]);
  });

  it("dedupes the creator if they also appear in inviteUserIds", () => {
    expect(buildInitialRoster({ creatorId: "alice", inviteUserIds: ["alice", "bob"] })).toEqual([
      "alice",
      "bob"
    ]);
  });

  it("dedupes repeated invitees while preserving first-seen order", () => {
    expect(
      buildInitialRoster({ creatorId: "alice", inviteUserIds: ["bob", "chris", "bob"] })
    ).toEqual(["alice", "bob", "chris"]);
  });

  it("returns just the creator when no one else is invited", () => {
    expect(buildInitialRoster({ creatorId: "alice", inviteUserIds: [] })).toEqual(["alice"]);
  });

  it("returns a frozen array", () => {
    const roster = buildInitialRoster({ creatorId: "alice", inviteUserIds: ["bob"] });
    expect(Object.isFrozen(roster)).toBe(true);
  });
});

describe("validateFirstLegCommitments", () => {
  const eligiblePositions: EligiblePosition[] = [
    { positionId: "lot-1", marketId: "market-1", outcomeIndex: 0, availableShares: "200" },
    { positionId: "lot-2", marketId: "market-1", outcomeIndex: 0, availableShares: "50" },
    { positionId: "lot-3", marketId: "market-1", outcomeIndex: 1, availableShares: "300" },
    { positionId: "lot-4", marketId: "market-2", outcomeIndex: 0, availableShares: "300" }
  ];

  function commitments(...c: LegCommitment[]): LegCommitment[] {
    return c;
  }

  it("passes for a single valid commitment within the position's available shares", () => {
    expect(() =>
      validateFirstLegCommitments({
        marketId: "market-1",
        outcomeIndex: 0,
        commitments: commitments({ positionId: "lot-1", shares: "100" }),
        eligiblePositions
      })
    ).not.toThrow();
  });

  it("passes for multiple commitments, each checked against its own position's availability", () => {
    expect(() =>
      validateFirstLegCommitments({
        marketId: "market-1",
        outcomeIndex: 0,
        commitments: commitments(
          { positionId: "lot-1", shares: "200" },
          { positionId: "lot-2", shares: "50" }
        ),
        eligiblePositions
      })
    ).not.toThrow();
  });

  it("rejects an empty commitments array with NO_COMMITMENTS — no stakeless leg is ever valid", () => {
    expect(() =>
      validateFirstLegCommitments({
        marketId: "market-1",
        outcomeIndex: 0,
        commitments: [],
        eligiblePositions
      })
    ).toThrow("NO_COMMITMENTS");
  });

  it("rejects a commitment referencing a position the caller doesn't have", () => {
    expect(() =>
      validateFirstLegCommitments({
        marketId: "market-1",
        outcomeIndex: 0,
        commitments: commitments({ positionId: "lot-unknown", shares: "10" }),
        eligiblePositions
      })
    ).toThrow("COMMITMENT_POSITION_NOT_FOUND");
  });

  it("rejects a commitment whose position is the wrong outcome of the right market", () => {
    expect(() =>
      validateFirstLegCommitments({
        marketId: "market-1",
        outcomeIndex: 0,
        commitments: commitments({ positionId: "lot-3", shares: "10" }),
        eligiblePositions
      })
    ).toThrow("COMMITMENT_MARKET_MISMATCH");
  });

  it("rejects a commitment whose position is a different market entirely", () => {
    expect(() =>
      validateFirstLegCommitments({
        marketId: "market-1",
        outcomeIndex: 0,
        commitments: commitments({ positionId: "lot-4", shares: "10" }),
        eligiblePositions
      })
    ).toThrow("COMMITMENT_MARKET_MISMATCH");
  });

  it("rejects a commitment requesting more shares than the position has available", () => {
    expect(() =>
      validateFirstLegCommitments({
        marketId: "market-1",
        outcomeIndex: 0,
        commitments: commitments({ positionId: "lot-2", shares: "50.01" }),
        eligiblePositions
      })
    ).toThrow("COMMITMENT_EXCEEDS_AVAILABLE_SHARES");
  });

  it("allows committing exactly all of a position's available shares", () => {
    expect(() =>
      validateFirstLegCommitments({
        marketId: "market-1",
        outcomeIndex: 0,
        commitments: commitments({ positionId: "lot-2", shares: "50" }),
        eligiblePositions
      })
    ).not.toThrow();
  });

  it("rejects the whole batch if any single commitment in it is invalid — no partial leg", () => {
    expect(() =>
      validateFirstLegCommitments({
        marketId: "market-1",
        outcomeIndex: 0,
        commitments: commitments(
          { positionId: "lot-1", shares: "100" },
          { positionId: "lot-3", shares: "10" } // wrong outcome
        ),
        eligiblePositions
      })
    ).toThrow("COMMITMENT_MARKET_MISMATCH");
  });
});
