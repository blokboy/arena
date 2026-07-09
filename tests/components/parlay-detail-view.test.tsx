import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ParlayDetailView } from "@/components/parlays/parlay-detail-view";
import type { LegTimelineLeg } from "@/components/parlays/leg-timeline";

const legs: LegTimelineLeg[] = [
  {
    id: "leg-active",
    status: "ACTIVE",
    endDate: "2028-11-08T00:00:00.000Z",
    marketQuestion: "Will the Democrat win in 2028?",
    outcomeLabel: "Yes",
    aggregateStakeAmount: "67.2",
    backerCount: 2
  },
  {
    id: "leg-pending",
    status: "PENDING",
    endDate: "2028-11-09T00:00:00.000Z",
    marketQuestion: "Will the World Cup winner be Brazil?",
    outcomeLabel: "Yes",
    aggregateStakeAmount: "3.6",
    backerCount: 1
  }
];

const activeLeg = {
  id: "leg-active",
  marketQuestion: "Will the Democrat win in 2028?",
  stakes: [
    {
      user: { id: "alice-id", username: "alice" },
      amount: "64",
      averageEntryPrice: "0.64",
      shares: "100",
      status: "ACTIVE" as const
    }
  ],
  memberVoteTally: {
    totalMemberStake: "64",
    yesStake: "0",
    members: [{ userId: "alice-id", username: "alice", amount: "64", sharePct: 1, votingYes: false }]
  },
  isFinalLeg: false
};

const backEligibleLot = {
  positionId: "position-2",
  marketQuestion: "Will the Democrat win in 2028?",
  outcomeLabel: "Yes",
  availableShares: "10"
};

const appendEligibleLot = {
  positionId: "position-3",
  marketQuestion: "Will the World Cup winner be Brazil?",
  outcomeLabel: "Yes",
  availableShares: "20"
};

const baseProps = {
  parlay: {
    id: "parlay-1",
    name: "Late Slate",
    members: [
      { userId: "alice-id", username: "alice" },
      { userId: "bob-id", username: "bob" }
    ]
  },
  legs,
  activeLeg,
  appendEligibleLot,
  backEligibleLot,
  onAppend: vi.fn(),
  onBack: vi.fn(),
  appendError: null,
  backError: null
};

describe("ParlayDetailView", () => {
  test("shows the parlay name, roster size, and current active leg summary", () => {
    render(<ParlayDetailView {...baseProps} currentUserId="alice-id" />);

    expect(screen.getByText("Late Slate")).toBeInTheDocument();
    expect(screen.getByText(/2 members/)).toBeInTheDocument();
    expect(screen.getByText(/currently live/i)).toBeInTheDocument();
  });

  test("renders the timeline, the active-leg marker, and the active leg's backer list", () => {
    render(<ParlayDetailView {...baseProps} currentUserId="alice-id" />);

    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/you are here/i)).toBeInTheDocument();
    expect(screen.getAllByText("alice").length).toBeGreaterThan(0);
  });

  test("a formal member sees a working append-leg form", () => {
    render(<ParlayDetailView {...baseProps} currentUserId="alice-id" />);

    expect(screen.getByRole("button", { name: /append leg/i })).toBeInTheDocument();
  });

  test("a non-member sees the append action disabled with a visible reason, not silently hidden", () => {
    render(<ParlayDetailView {...baseProps} currentUserId="stranger-id" />);

    expect(screen.queryByRole("button", { name: /append leg/i })).not.toBeInTheDocument();
    expect(screen.getByText(/only parlay members can append new legs/i)).toBeInTheDocument();
  });

  test("any authenticated user, member or not, sees a working back-this-leg form", () => {
    render(<ParlayDetailView {...baseProps} currentUserId="stranger-id" />);

    expect(screen.getByRole("button", { name: /back this leg/i })).toBeInTheDocument();
  });
});
