import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { insertMeanRow, type LeaderboardRow } from "@/domain/leaderboard";
import { formatPoints } from "@/lib/money";

// Mirrors this repo's convention (see tests/components/portfolio-sell.test.tsx)
// of testing a pure domain helper alongside the component that consumes it,
// rather than splitting it into a separate unit-tier file — Issue #7 itself
// labels "MEAN row insertion" as a Component-tier test.
describe("insertMeanRow", () => {
  const ada: LeaderboardRow = { rank: 1, userId: "ada", username: "ada", balance: 1_500 };
  const dormant: LeaderboardRow = {
    rank: 2,
    userId: "dormant",
    username: "dormant",
    balance: 1_000
  };
  const grace: LeaderboardRow = { rank: 3, userId: "grace", username: "grace", balance: 500 };

  test("inserts MEAN strictly between the two rows it falls numerically between", () => {
    expect(insertMeanRow([ada, dormant, grace], 750)).toEqual([
      { kind: "user", ...ada },
      { kind: "user", ...dormant },
      { kind: "mean", balance: 750 },
      { kind: "user", ...grace }
    ]);
  });

  test("pins MEAN at the top when it exceeds every real balance", () => {
    const rows = [
      { rank: 1, userId: "a", username: "a", balance: 500 },
      { rank: 2, userId: "b", username: "b", balance: 300 }
    ];
    expect(insertMeanRow(rows, 1_000)[0]).toEqual({ kind: "mean", balance: 1_000 });
  });

  test("pins MEAN at the bottom when it is below every real balance", () => {
    const rows = [
      { rank: 1, userId: "a", username: "a", balance: 1_500 },
      { rank: 2, userId: "b", username: "b", balance: 1_200 }
    ];
    const result = insertMeanRow(rows, 1_000);
    expect(result[result.length - 1]).toEqual({ kind: "mean", balance: 1_000 });
  });

  test("on an exact tie, places MEAN after the row(s) at that balance rather than before", () => {
    const rows = [
      { rank: 1, userId: "a", username: "a", balance: 1_000 },
      { rank: 2, userId: "b", username: "b", balance: 800 }
    ];
    expect(insertMeanRow(rows, 1_000)).toEqual([
      { kind: "user", ...rows[0] },
      { kind: "mean", balance: 1_000 },
      { kind: "user", ...rows[1] }
    ]);
  });

  test("omits the MEAN entry entirely when there are no active users", () => {
    const result = insertMeanRow([ada, grace], null);
    expect(result).toEqual([
      { kind: "user", ...ada },
      { kind: "user", ...grace }
    ]);
    expect(result.some((entry) => entry.kind === "mean")).toBe(false);
  });

  test("never renumbers real users' ranks around the inserted MEAN entry", () => {
    const result = insertMeanRow([ada, dormant, grace], 750);
    const userEntries = result.filter((entry) => entry.kind === "user");
    expect(userEntries.map((entry) => (entry as typeof ada).rank)).toEqual([1, 2, 3]);
  });
});

describe("LeaderboardTable", () => {
  const rows: LeaderboardRow[] = [
    { rank: 1, userId: "ada", username: "ada", balance: 1_500 },
    { rank: 2, userId: "dormant", username: "dormant", balance: 1_000 },
    { rank: 3, userId: "grace", username: "grace", balance: 500 }
  ];

  test("renders a real semantic table with one row per real user, ranked in order", () => {
    render(<LeaderboardTable rows={rows} mean={750} currentUsername="ada" />);

    const table = screen.getByRole("table");
    const dataRows = within(table)
      .getAllByRole("row")
      .filter((row) => within(row).queryAllByRole("cell").length > 0);

    // 3 real users + 1 synthetic MEAN row, MEAN never counted in `rank`.
    expect(dataRows).toHaveLength(4);
    expect(screen.getByText("ada")).toBeInTheDocument();
    expect(screen.getByText("dormant")).toBeInTheDocument();
    expect(screen.getByText("grace")).toBeInTheDocument();
    expect(screen.getByText(formatPoints(1_500))).toBeInTheDocument();
    expect(screen.getByText(formatPoints(1_000))).toBeInTheDocument();
    expect(screen.getByText(formatPoints(500))).toBeInTheDocument();
  });

  test("inserts the MEAN row at its numerically correct position, not forced to top or bottom", () => {
    render(<LeaderboardTable rows={rows} mean={750} currentUsername="ada" />);

    const table = screen.getByRole("table");
    const rowTexts = within(table)
      .getAllByRole("row")
      .map((row) => row.textContent ?? "");

    const adaIndex = rowTexts.findIndex((text) => text.includes("ada"));
    const dormantIndex = rowTexts.findIndex((text) => text.includes("dormant"));
    const meanIndex = rowTexts.findIndex((text) => text.includes("MEAN"));
    const graceIndex = rowTexts.findIndex((text) => text.includes("grace"));

    expect(adaIndex).toBeGreaterThanOrEqual(0);
    expect(adaIndex).toBeLessThan(dormantIndex);
    expect(dormantIndex).toBeLessThan(meanIndex);
    expect(meanIndex).toBeLessThan(graceIndex);
  });

  test("does not render a MEAN row when there are no active users", () => {
    render(<LeaderboardTable rows={rows} mean={null} currentUsername="ada" />);

    expect(screen.queryByText("MEAN")).not.toBeInTheDocument();
  });

  test("labels the MEAN row with a badge and the exact PRD caption, distinguishing it from a competitor", () => {
    render(<LeaderboardTable rows={rows} mean={750} currentUsername="ada" />);

    expect(screen.getByText("MEAN")).toBeInTheDocument();
    expect(
      screen.getByText("Live average balance across all users — not a real account.")
    ).toBeInTheDocument();
  });

  test("gives the MEAN row an accessible description calling out that it is synthetic (a11y flag #6)", () => {
    render(<LeaderboardTable rows={rows} mean={750} currentUsername="ada" />);

    const meanRow = screen.getByRole("row", { name: /not a real account/i });
    expect(meanRow).toBeInTheDocument();
  });

  test("highlights the current user's row so they can find themselves without scanning ranks", () => {
    render(<LeaderboardTable rows={rows} mean={750} currentUsername="grace" />);

    const graceRow = screen.getByRole("row", { name: /grace/ });
    expect(within(graceRow).getByText(/you/i)).toBeInTheDocument();

    const adaRow = screen.getByRole("row", { name: /^(?!.*grace).*ada/ });
    expect(within(adaRow).queryByText(/you/i)).not.toBeInTheDocument();
  });

  test("never highlights the synthetic MEAN row as the current user, even on a name collision", () => {
    render(<LeaderboardTable rows={rows} mean={750} currentUsername="MEAN" />);

    const meanRow = screen.getByRole("row", { name: /not a real account/i });
    expect(within(meanRow).queryByText(/you/i)).not.toBeInTheDocument();
  });

  test("renders no time-range filter, matching the PRD's all-time-only scope", () => {
    render(<LeaderboardTable rows={rows} mean={750} currentUsername="ada" />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /season|this week|this month|all time/i })
    ).not.toBeInTheDocument();
  });
});
