import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { RolloverControl, type MemberVoteTally } from "@/components/parlays/rollover-control";

const tally: MemberVoteTally = {
  totalMemberStake: "100",
  yesStake: "62",
  members: [
    { userId: "alice-id", username: "alice", amount: "62", sharePct: 0.62, votingYes: true },
    { userId: "bob-id", username: "bob", amount: "38", sharePct: 0.38, votingYes: false }
  ]
};

describe("RolloverControl (read-only)", () => {
  test("renders the live stake-weighted tally percentage with aria-live=polite", () => {
    render(<RolloverControl memberVoteTally={tally} isFinalLeg={false} />);

    const tallyText = screen.getByText(/62% of member stake voting to roll over/i);
    expect(tallyText).toBeInTheDocument();
    expect(tallyText.closest('[aria-live="polite"]')).not.toBeNull();
  });

  test("renders one read-only row per member with their stake share and vote state", () => {
    render(<RolloverControl memberVoteTally={tally} isFinalLeg={false} />);

    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByText("38%")).toBeInTheDocument();
  });

  test("never renders a vote-casting control — read-only until a vote endpoint exists", () => {
    render(<RolloverControl memberVoteTally={tally} isFinalLeg={false} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  test("renders nothing when the leg has never had member stake (null tally)", () => {
    const { container } = render(<RolloverControl memberVoteTally={null} isFinalLeg={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing on the final leg, even with a tally", () => {
    const { container } = render(<RolloverControl memberVoteTally={tally} isFinalLeg />);

    expect(container).toBeEmptyDOMElement();
  });
});
