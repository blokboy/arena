import { describe, expect, it } from "vitest";

import { buildLeaderboard } from "../../src/domain/leaderboard";

describe("buildLeaderboard", () => {
  it("ranks every real user but computes MEAN over active users only", () => {
    expect(
      buildLeaderboard({
        users: [
          { id: "ada", username: "ada", balance: 1_500 },
          { id: "grace", username: "grace", balance: 500 },
          { id: "dormant", username: "dormant", balance: 1_000 }
        ],
        positionUserIds: ["ada"],
        legStakeUserIds: ["grace"]
      })
    ).toEqual({
      rows: [
        { rank: 1, userId: "ada", username: "ada", balance: 1_500 },
        { rank: 2, userId: "dormant", username: "dormant", balance: 1_000 },
        { rank: 3, userId: "grace", username: "grace", balance: 500 }
      ],
      mean: 1_000
    });
  });

  it("treats users with any historical position or leg stake as active with no recency window", () => {
    expect(
      buildLeaderboard({
        users: [
          { id: "position-only", username: "position-only", balance: 200 },
          { id: "stake-only", username: "stake-only", balance: 800 },
          { id: "inactive", username: "inactive", balance: 1_000 }
        ],
        positionUserIds: ["position-only"],
        legStakeUserIds: ["stake-only"]
      }).mean
    ).toBe(500);
  });

  it("returns mean separately instead of inserting a synthetic ranked row", () => {
    const leaderboard = buildLeaderboard({
      users: [
        { id: "ada", username: "ada", balance: 1_200 },
        { id: "grace", username: "grace", balance: 800 }
      ],
      positionUserIds: ["ada", "grace"],
      legStakeUserIds: []
    });

    expect(leaderboard.rows).toHaveLength(2);
    expect(leaderboard.rows.map((row) => row.username)).not.toContain("MEAN");
    expect(leaderboard.mean).toBe(1_000);
  });
});
