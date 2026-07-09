import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, beforeEach } from "vitest";

import { ClaimPicker } from "@/components/days-parlay/claim-picker";
import type { DaysParlayEligibleEvent } from "@/server/days-parlay";

const availableMarket = {
  marketId: "market-1",
  gammaId: "gamma-1",
  question: "Will it rain tomorrow?",
  outcomes: ["Yes", "No"],
  outcomePrices: ["0.6", "0.4"],
  bestBid: "0.58",
  bestAsk: "0.62",
  endDate: "2026-07-10T18:00:00.000Z",
  lastSyncedAt: "2026-07-10T12:00:00.000Z",
  claimStatus: "available" as const,
  myAvailableLots: [
    {
      positionId: "pos-1",
      outcomeIndex: 0,
      outcomeLabel: "Yes",
      availableShares: "50",
      entryPrice: "0.55",
      createdAt: "2026-07-09T10:00:00.000Z"
    },
    {
      positionId: "pos-2",
      outcomeIndex: 1,
      outcomeLabel: "No",
      availableShares: "30",
      entryPrice: "0.42",
      createdAt: "2026-07-09T10:00:00.000Z"
    }
  ]
};

const claimedMarket = {
  ...availableMarket,
  marketId: "market-2",
  gammaId: "gamma-2",
  question: "Will the stock close green?",
  claimStatus: "claimed" as const,
  claimedLegId: "leg-1",
  claimedByUsername: "alice"
};

const closedMarket = {
  ...availableMarket,
  marketId: "market-3",
  gammaId: "gamma-3",
  question: "Already closed market?",
  claimStatus: "closed" as const,
  myAvailableLots: []
};

const eligibleEvents: DaysParlayEligibleEvent[] = [
  {
    eventId: "event-1",
    title: "Weather Events",
    category: "weather",
    markets: [availableMarket, closedMarket]
  },
  {
    eventId: "event-2",
    title: "Stock Events",
    category: "finance",
    markets: [claimedMarket]
  }
];

describe("ClaimPicker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("shows empty state when no markets are eligible at all", () => {
    const eventsWithNoAvailable: DaysParlayEligibleEvent[] = [
      {
        eventId: "event-1",
        title: "Events",
        category: "cat",
        markets: [claimedMarket, closedMarket]
      }
    ];

    render(<ClaimPicker eligibleEvents={eventsWithNoAvailable} onClaimed={vi.fn()} />);

    expect(
      screen.getByText(/no markets are eligible for today.s day.s parlay/i)
    ).toBeInTheDocument();
  });

  test("hides an available market the caller holds no shares in when they hold shares elsewhere", () => {
    const noHoldingsMarket = {
      ...availableMarket,
      marketId: "market-4",
      gammaId: "gamma-4",
      question: "Market with no owned shares?",
      myAvailableLots: []
    };
    const eventsWithMixedHoldings: DaysParlayEligibleEvent[] = [
      {
        eventId: "event-1",
        title: "Weather Events",
        category: "weather",
        markets: [availableMarket, noHoldingsMarket]
      }
    ];

    render(<ClaimPicker eligibleEvents={eventsWithMixedHoldings} onClaimed={vi.fn()} />);

    expect(screen.getByText("Will it rain tomorrow?")).toBeInTheDocument();
    expect(screen.queryByText("Market with no owned shares?")).not.toBeInTheDocument();
    expect(screen.queryByText(/you don.t have shares in any/i)).not.toBeInTheDocument();
  });

  test("falls back to browsing every eligible market when the caller holds no shares anywhere", () => {
    const noHoldingsMarket = {
      ...availableMarket,
      marketId: "market-4",
      gammaId: "gamma-4",
      question: "Market with no owned shares?",
      myAvailableLots: []
    };
    const eventsWithNoHoldings: DaysParlayEligibleEvent[] = [
      {
        eventId: "event-3",
        title: "No Holdings Events",
        category: "cat",
        markets: [noHoldingsMarket]
      }
    ];

    render(<ClaimPicker eligibleEvents={eventsWithNoHoldings} onClaimed={vi.fn()} />);

    expect(screen.getByText(/you don.t have shares in any/i)).toBeInTheDocument();
    expect(screen.getByText("Market with no owned shares?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /claim/i })).toBeInTheDocument();
  });

  test("renders available markets grouped by event", () => {
    render(<ClaimPicker eligibleEvents={eligibleEvents} onClaimed={vi.fn()} />);

    expect(screen.getByText("Weather Events")).toBeInTheDocument();
    expect(screen.getByText("Will it rain tomorrow?")).toBeInTheDocument();
    expect(screen.queryByText("Stock Events")).not.toBeInTheDocument();
    expect(screen.queryByText("Will the stock close green?")).not.toBeInTheDocument();
  });

  test("shows Claim button for each available market", () => {
    render(<ClaimPicker eligibleEvents={eligibleEvents} onClaimed={vi.fn()} />);

    expect(screen.getByRole("button", { name: /claim/i })).toBeInTheDocument();
  });

  test("expands the claim form when Claim is clicked", async () => {
    const user = userEvent.setup();
    render(<ClaimPicker eligibleEvents={eligibleEvents} onClaimed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /claim/i }));

    expect(screen.getByText("Select outcome")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /yes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /no/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  test("shows outcome buttons with lot counts", async () => {
    const user = userEvent.setup();
    render(<ClaimPicker eligibleEvents={eligibleEvents} onClaimed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /claim/i }));

    expect(screen.getByRole("button", { name: /yes.*1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /no.*1/i })).toBeInTheDocument();
  });

  test("disables submit when no outcome is selected", async () => {
    const user = userEvent.setup();
    render(<ClaimPicker eligibleEvents={eligibleEvents} onClaimed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /claim/i }));

    expect(screen.getByRole("button", { name: /claim market/i })).toBeDisabled();
  });

  test("calls onClaimed after a successful claim", async () => {
    const user = userEvent.setup();
    const onClaimed = vi.fn();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { leg: { id: "leg-new", status: "ACTIVE" } } })
    });

    render(<ClaimPicker eligibleEvents={eligibleEvents} onClaimed={onClaimed} />);

    await user.click(screen.getByRole("button", { name: /claim/i }));
    await user.click(screen.getByRole("button", { name: /yes/i }));

    const shareInput = screen.getByLabelText(/shares to commit/i);
    await user.type(shareInput, "10");

    await user.click(screen.getByRole("button", { name: /claim market/i }));

    await waitFor(() => {
      expect(onClaimed).toHaveBeenCalled();
    });
  });

  test("shows MARKET_ALREADY_CLAIMED error when claim returns 409", async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "MARKET_ALREADY_CLAIMED" } })
    });

    render(<ClaimPicker eligibleEvents={eligibleEvents} onClaimed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /claim/i }));
    await user.click(screen.getByRole("button", { name: /yes/i }));

    const shareInput = screen.getByLabelText(/shares to commit/i);
    await user.type(shareInput, "10");

    await user.click(screen.getByRole("button", { name: /claim market/i }));

    await waitFor(() => {
      expect(screen.getByText(/already claimed by another user/i)).toBeInTheDocument();
    });
  });

  test("renders LEG_APPEND_TOO_EARLY error with active leg end date", async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: {
          code: "LEG_APPEND_TOO_EARLY",
          details: { activeLegEndDate: "2026-07-10T18:00:00.000Z" }
        }
      })
    });

    render(<ClaimPicker eligibleEvents={eligibleEvents} onClaimed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /claim/i }));
    await user.click(screen.getByRole("button", { name: /yes/i }));

    const shareInput = screen.getByLabelText(/shares to commit/i);
    await user.type(shareInput, "10");

    await user.click(screen.getByRole("button", { name: /claim market/i }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/resolves before the current active leg/i);
      expect(alert).toHaveTextContent(/Jul 10/);
    });
  });

  test("grays out the picker while a claim is submitting, and rolls back on rejection", async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: unknown) => void = () => {};

    globalThis.fetch = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    render(<ClaimPicker eligibleEvents={eligibleEvents} onClaimed={vi.fn()} />);

    const claimButtons = screen.getAllByRole("button", { name: /^claim$/i });
    expect(claimButtons).toHaveLength(1);

    await user.click(claimButtons[0]!);
    await user.click(screen.getByRole("button", { name: /yes/i }));
    await user.type(screen.getByLabelText(/shares to commit/i), "10");
    await user.click(screen.getByRole("button", { name: /claim market/i }));

    // Still awaiting the server: outcome selection is locked so the in-flight
    // claim can't be changed out from under itself before it resolves.
    expect(screen.getByRole("button", { name: /^yes/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^no.*1/i })).toBeDisabled();

    resolveFetch({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "MARKET_ALREADY_CLAIMED" } })
    });

    await waitFor(() => {
      expect(screen.getByText(/already claimed by another user/i)).toBeInTheDocument();
    });

    // Rolled back: rejected, so the form is interactive again for a retry.
    expect(screen.getByRole("button", { name: /^yes/i })).toBeEnabled();
  });

  test("collapses the form when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<ClaimPicker eligibleEvents={eligibleEvents} onClaimed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /claim/i }));
    expect(screen.getByText("Select outcome")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText("Select outcome")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /claim$/i })).toBeInTheDocument();
  });
});
