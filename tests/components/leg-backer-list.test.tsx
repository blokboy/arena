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

describe("LegBackerList settlement fields", () => {
  test("shows the credited payout for a stake that paid the user something", () => {
    const wonStakes: LegBackerStake[] = [
      {
        user: { id: "alice-id", username: "alice" },
        amount: "64",
        averageEntryPrice: "0.64",
        shares: "100",
        status: "WON",
        payout: "100"
      }
    ];

    render(<LegBackerList stakes={wonStakes} />);

    expect(screen.getByText(/paid out 100/i)).toBeInTheDocument();
  });

  test("does not render payout copy when payout is zero (forwarded or forfeited)", () => {
    const forwardedStakes: LegBackerStake[] = [
      {
        user: { id: "alice-id", username: "alice" },
        amount: "64",
        averageEntryPrice: "0.64",
        shares: "100",
        status: "WON",
        payout: "0"
      }
    ];

    render(<LegBackerList stakes={forwardedStakes} />);

    expect(screen.queryByText(/paid out/i)).not.toBeInTheDocument();
  });

  test("links to the destination leg when a stake's value carried forward", () => {
    const stakes: LegBackerStake[] = [
      {
        user: { id: "alice-id", username: "alice" },
        amount: "64",
        averageEntryPrice: "0.64",
        shares: "100",
        status: "WON",
        payout: "0",
        rolledForwardToLegId: "leg-2"
      }
    ];

    render(<LegBackerList stakes={stakes} />);

    const link = screen.getByRole("link", { name: /carried forward/i });
    expect(link).toHaveAttribute("href", "#leg-leg-2");
  });

  test("links back to the source leg when a stake includes forwarded proceeds", () => {
    const stakes: LegBackerStake[] = [
      {
        user: { id: "alice-id", username: "alice" },
        amount: "64",
        averageEntryPrice: "0.64",
        shares: "100",
        status: "ACTIVE",
        rolledForwardFromLegId: "leg-1"
      }
    ];

    render(<LegBackerList stakes={stakes} />);

    const link = screen.getByRole("link", { name: /proceeds from an earlier leg/i });
    expect(link).toHaveAttribute("href", "#leg-leg-1");
  });

  test("shows the stop-loss exit price for a rolled-over stake", () => {
    const stakes: LegBackerStake[] = [
      {
        user: { id: "alice-id", username: "alice" },
        amount: "64",
        averageEntryPrice: "0.64",
        shares: "100",
        status: "ROLLED_OVER",
        exitPrice: "0.71"
      }
    ];

    render(<LegBackerList stakes={stakes} />);

    expect(screen.getByText(/exited at 0\.71/i)).toBeInTheDocument();
  });
});
