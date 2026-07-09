import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, afterEach } from "vitest";

import { VoteSpendButton } from "@/components/days-parlay/vote-spend-button";

const baseProps = {
  legId: "leg-1",
  currentLegMarket: { bestBid: "0.55" },
  nextLegMarket: { bestAsk: "0.25" },
  callerShares: "100",
  onCommitted: vi.fn()
};

describe("VoteSpendButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("opens a one-shot confirm dialog with the scarcity/irreversibility copy, not a toggle", async () => {
    render(<VoteSpendButton {...baseProps} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Spend your rollover vote on this leg" })
    );

    const dialog = screen.getByRole("dialog", { name: "Spend your rollover vote" });
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByText(
        "Spend your one rollover vote on this leg? You won't be able to vote on any other leg today."
      )
    ).toBeInTheDocument();
  });

  test("moves focus to Cancel on open (not Confirm) and returns focus to the trigger on cancel", async () => {
    render(<VoteSpendButton {...baseProps} />);

    const trigger = screen.getByRole("button", { name: "Spend your rollover vote on this leg" });
    await userEvent.click(trigger);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton).toHaveFocus();

    await userEvent.click(cancelButton);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test("closes on Escape and returns focus to the trigger", async () => {
    render(<VoteSpendButton {...baseProps} />);

    const trigger = screen.getByRole("button", { name: "Spend your rollover vote on this leg" });
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test("renders the stop-loss preview when both prices and caller shares are available", async () => {
    render(<VoteSpendButton {...baseProps} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Spend your rollover vote on this leg" })
    );

    expect(screen.getByText("Stop-loss preview")).toBeInTheDocument();
    expect(screen.getByText("0.55")).toBeInTheDocument();
    expect(screen.getByText("0.25")).toBeInTheDocument();
    expect(screen.getByText("220")).toBeInTheDocument();
  });

  test("shows a graceful fallback when the stop-loss preview is unavailable (e.g. next leg missing)", async () => {
    render(<VoteSpendButton {...baseProps} nextLegMarket={null} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Spend your rollover vote on this leg" })
    );

    expect(
      screen.getByText("Current stop-loss preview is unavailable until both market prices sync.")
    ).toBeInTheDocument();
  });

  test("posts the vote and calls onCommitted after confirmation", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { didExecuteRollover: false } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const onCommitted = vi.fn();

    render(<VoteSpendButton {...baseProps} onCommitted={onCommitted} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Spend your rollover vote on this leg" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Spend vote" }));

    await waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith("/api/days-parlay/legs/leg-1/rollover-vote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vote: true })
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test.each([
    ["ROLLOVER_CAP_REACHED", /rollover cap \(3 per day\) has already been reached/i],
    ["VOTE_ALREADY_SPENT", /already spent today's one rollover vote/i],
    ["LEG_NOT_ACTIVE", /no longer active/i],
    ["BACKER_REQUIRED", /only backers who staked into this leg/i],
    ["FINAL_LEG_NOT_ROLLOVERABLE", /no next leg to roll into/i],
    ["PARLAY_NOT_ACTIVE", /day's parlay is no longer active/i]
  ])("shows a distinct message for %s", async (code, expectedText) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code } }), {
        status: 409,
        headers: { "content-type": "application/json" }
      })
    );

    render(<VoteSpendButton {...baseProps} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Spend your rollover vote on this leg" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Spend vote" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(expectedText);
    // The dialog stays open on failure so the user can see the specific reason.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("includes the VOTE_ALREADY_SPENT spentOnLegId detail is handled gracefully even when absent", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "VOTE_ALREADY_SPENT", details: {} } }), {
        status: 409,
        headers: { "content-type": "application/json" }
      })
    );

    render(<VoteSpendButton {...baseProps} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Spend your rollover vote on this leg" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Spend vote" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /already spent today's one rollover vote/i
    );
  });
});
