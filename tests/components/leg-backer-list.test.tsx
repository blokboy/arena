import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { LegBackerList, type LegBackerStake } from "@/components/parlays/leg-backer-list";

const stakes: LegBackerStake[] = [
  {
    user: { id: "alice-id", username: "alice" },
    amount: "64",
    averageEntryPrice: "0.64",
    shares: "100",
    status: "ACTIVE"
  },
  {
    user: { id: "chris-id", username: "chris" },
    amount: "3.2",
    averageEntryPrice: "0.64",
    shares: "5",
    status: "VOIDED_REFUNDED"
  }
];

describe("LegBackerList", () => {
  test("renders one row per backer with username, amount, shares, and average entry price", () => {
    render(<LegBackerList stakes={stakes} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);

    expect(within(rows[0]!).getByText("alice")).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/64/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/100/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/0\.64/)).toBeInTheDocument();
  });

  test("shows each backer's stake status using the shared non-color status badge", () => {
    render(<LegBackerList stakes={stakes} />);

    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Voided, refunded")).toBeInTheDocument();
  });

  test("renders an accessible empty state when a leg has no backers yet", () => {
    render(<LegBackerList stakes={[]} />);

    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.getByText(/no backers yet/i)).toBeInTheDocument();
  });
});
