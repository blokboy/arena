import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { DaysParlayDashboardCard } from "@/components/days-parlay/days-parlay-dashboard-card";
import type { DaysParlayDetailLeg } from "@/server/days-parlay";

const baseLeg = {
  outcomeIndex: 0,
  status: "PENDING",
  claimedBy: null,
  market: {
    gammaId: "gamma-1",
    question: "Will it rain?",
    outcomes: ["Yes", "No"],
    outcomePrices: ["0.6", "0.4"],
    endDate: "2026-07-10T18:00:00.000Z",
    lastSyncedAt: "2026-07-10T12:00:00.000Z",
    bestBid: null,
    bestAsk: null
  },
  stakes: [],
  tally: { yesCount: 0, totalBackerCount: 0 },
  isFinalLeg: false
} satisfies Omit<DaysParlayDetailLeg, "id">;

describe("DaysParlayDashboardCard", () => {
  test("renders leg count and active leg question", () => {
    const legs: DaysParlayDetailLeg[] = [
      { ...baseLeg, id: "leg-1", status: "ACTIVE" },
      { ...baseLeg, id: "leg-2", status: "PENDING" }
    ];

    render(<DaysParlayDashboardCard legs={legs} />);

    expect(screen.getByText(/Leg/)).toBeInTheDocument();
    expect(screen.getByText(/live now/)).toBeInTheDocument();
    expect(screen.getByText(/will it rain\?/i)).toBeInTheDocument();
  });

  test("renders no active leg when none is ACTIVE", () => {
    const legs: DaysParlayDetailLeg[] = [
      { ...baseLeg, id: "leg-1", status: "WON" }
    ];

    render(<DaysParlayDashboardCard legs={legs} />);

    expect(screen.getByText(/no active leg/)).toBeInTheDocument();
  });

  test("renders zero legs", () => {
    render(<DaysParlayDashboardCard legs={[]} />);

    expect(screen.getByText(/no active leg/)).toBeInTheDocument();
  });
});
