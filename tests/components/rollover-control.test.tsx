import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { RolloverControl, type MemberVoteTally } from "@/components/parlays/rollover-control";

const tally: MemberVoteTally = {
  totalMemberStake: "100",
  yesStake: "38",
  members: [
    { userId: "alice-id", username: "alice", amount: "62", sharePct: 0.62, votingYes: false },
    { userId: "bob-id", username: "bob", amount: "38", sharePct: 0.38, votingYes: true }
  ]
};

const baseProps = {
  parlayId: "parlay-1",
  legId: "leg-1",
  currentUserId: "alice-id",
  memberVoteTally: tally,
  callerStake: {
    amount: "62",
    shares: "100",
    status: "ACTIVE"
  },
  currentLegMarket: {
    bestBid: "0.55"
  },
  nextLegMarket: {
    bestAsk: "0.25"
  },
  isFinalLeg: false,
  onVoted: vi.fn()
};

describe("RolloverControl", () => {
  test("renders the live stake-weighted tally percentage with aria-live=polite", () => {
    render(<RolloverControl {...baseProps} />);

    const tallyText = screen.getByText(/38% of member stake voting to roll over/i);
    expect(tallyText).toBeInTheDocument();
    expect(tallyText.closest('[aria-live="polite"]')).not.toBeNull();
  });

  test("renders the caller row as a switch and everyone else read-only", () => {
    render(<RolloverControl {...baseProps} />);

    const aliceRow = screen.getByText("alice").closest("li");
    const bobRow = screen.getByText("bob").closest("li");

    expect(aliceRow).not.toBeNull();
    expect(bobRow).not.toBeNull();
    expect(within(aliceRow!).getByText(/62\s*% of member stake/i)).toBeInTheDocument();
    expect(within(bobRow!).getByText(/38\s*% of member stake/i)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Vote to roll over" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
    expect(screen.getByText("Voting yes")).toBeInTheDocument();
  });

  test('opens the decisive confirmation copy and stop-loss preview on a "yes" vote', async () => {
    render(<RolloverControl {...baseProps} />);

    await userEvent.click(screen.getByRole("switch", { name: "Vote to roll over" }));

    const dialog = screen.getByRole("dialog", { name: "Confirm rollover vote" });
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your vote alone will trigger this rollover for the entire leg, including other members' and backers' stakes."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Stop-loss preview")).toBeInTheDocument();
    expect(screen.getByText("0.55")).toBeInTheDocument();
    expect(screen.getByText("0.25")).toBeInTheDocument();
    expect(screen.getByText("220")).toBeInTheDocument();
  });

  test("posts the vote and calls onVoted after confirmation", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { didExecuteRollover: true } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const onVoted = vi.fn();

    render(<RolloverControl {...baseProps} onVoted={onVoted} />);

    await userEvent.click(screen.getByRole("switch", { name: "Vote to roll over" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm vote" }));

    expect(fetch).toHaveBeenCalledWith("/api/parlays/parlay-1/legs/leg-1/rollover-vote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vote: true })
    });
    expect(onVoted).toHaveBeenCalledTimes(1);
  });

  test("renders a disabled-with-reason control for a non-voter", () => {
    render(
      <RolloverControl
        {...baseProps}
        currentUserId="chris-id"
        callerStake={{ amount: "15", shares: "20", status: "ACTIVE" }}
      />
    );

    const disabledSwitch = screen.getByRole("switch", { name: "Vote to roll over" });
    expect(disabledSwitch).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/only formal members with stake on this leg can vote/i)).toBeInTheDocument();
  });

  test("surfaces inline API errors next to the control", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "NOT_A_VOTING_MEMBER" } }), {
        status: 403,
        headers: { "content-type": "application/json" }
      })
    );

    render(<RolloverControl {...baseProps} />);

    await userEvent.click(screen.getByRole("switch", { name: "Vote to roll over" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm vote" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only formal members with stake on this leg can vote to roll over."
    );
  });

  test("renders nothing when the leg has never had member stake (null tally)", () => {
    const { container } = render(<RolloverControl {...baseProps} memberVoteTally={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing on the final leg, even with a tally", () => {
    const { container } = render(<RolloverControl {...baseProps} isFinalLeg />);

    expect(container).toBeEmptyDOMElement();
  });
});
