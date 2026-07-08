import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { RandomParlaysModule } from "@/components/leaderboard/random-parlays-module";
import type { RandomParlaySummary } from "@/server/parlays";

const climbers: RandomParlaySummary = {
  id: "parlay-climbers",
  name: "Climbers",
  kind: "REGULAR",
  rosterSize: 4,
  chainLength: 3,
  currentActiveLeg: {
    legId: "leg-1",
    marketQuestion: "Will a Democrat win the 2028 US presidential election?",
    endDate: "2028-11-08T00:00:00.000Z",
    status: "ACTIVE"
  }
};

const noActiveLeg: RandomParlaySummary = {
  id: "parlay-quiet",
  name: "Quiet Streak",
  kind: "REGULAR",
  rosterSize: 2,
  chainLength: 1,
  currentActiveLeg: null
};

describe("RandomParlaysModule", () => {
  test("renders a labeled discovery section distinct from any leaderboard table", () => {
    render(<RandomParlaysModule parlays={[climbers]} />);

    const region = screen.getByRole("region", { name: /discover parlays|random parlays/i });
    expect(region).toBeInTheDocument();
    // Discovery cards are not ranked rows — this module must never itself
    // render table/row semantics that could be mistaken for leaderboard rows.
    expect(within(region).queryAllByRole("row")).toHaveLength(0);
    expect(within(region).queryByRole("table")).not.toBeInTheDocument();
  });

  test("renders each parlay as a card-like list item, not a table row", () => {
    render(<RandomParlaysModule parlays={[climbers]} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  test("shows name, roster size, chain length, and the active leg's market question and status", () => {
    render(<RandomParlaysModule parlays={[climbers]} />);

    expect(screen.getByText("Climbers")).toBeInTheDocument();
    expect(screen.getByText(/4/)).toBeInTheDocument();
    expect(screen.getByText(/3 legs?/i)).toBeInTheDocument();
    expect(
      screen.getByText("Will a Democrat win the 2028 US presidential election?")
    ).toBeInTheDocument();
    expect(screen.getByText(/active/i)).toBeInTheDocument();
  });

  test("renders more than one card without collapsing them into a single summary", () => {
    render(<RandomParlaysModule parlays={[climbers, noActiveLeg]} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Climbers")).toBeInTheDocument();
    expect(screen.getByText("Quiet Streak")).toBeInTheDocument();
  });

  test("handles a parlay with no currently active leg without crashing", () => {
    render(<RandomParlaysModule parlays={[noActiveLeg]} />);

    expect(screen.getByText("Quiet Streak")).toBeInTheDocument();
  });

  test("renders a neutral empty state instead of an error when there is nothing to discover", () => {
    render(<RandomParlaysModule parlays={[]} />);

    expect(screen.getByRole("region", { name: /discover parlays|random parlays/i })).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
