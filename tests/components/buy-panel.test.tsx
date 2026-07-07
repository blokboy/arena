import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { BuyPanel } from "@/components/markets/buy-panel";
import type { CachedMarket } from "@/domain/markets";

const { routerRefresh } = vi.hoisted(() => ({ routerRefresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh })
}));

describe("buy panel: outcome selection", () => {
  test("preselects the first outcome for a binary market", () => {
    render(<BuyPanel market={binaryMarket()} balance={1000} />);

    expect(screen.getByRole("button", { name: /^Yes/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^No/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Stake")).not.toBeDisabled();
  });

  test("requires an explicit outcome choice for a multi-outcome market", () => {
    render(<BuyPanel market={multiOutcomeMarket()} balance={1000} />);

    for (const name of ["France", "Brazil", "Japan"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    }
    expect(screen.getByText("Choose an outcome to continue.")).toBeInTheDocument();
  });

  test("disables the stake input and submit until an outcome is chosen (multi-outcome only)", async () => {
    const user = userEvent.setup();
    render(<BuyPanel market={multiOutcomeMarket()} balance={1000} />);

    expect(screen.getByLabelText("Stake")).toBeDisabled();
    expect(screen.getByRole("button", { name: /maximum/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Buy" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^France/ }));

    expect(screen.getByLabelText("Stake")).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /maximum/ })).not.toBeDisabled();
  });
});

describe("buy panel: stake entry bounded by balance", () => {
  test("a stake over the current balance disables submit with a visible ceiling message", async () => {
    const user = userEvent.setup();
    render(<BuyPanel market={binaryMarket()} balance={1000} />);

    await user.type(screen.getByLabelText("Stake"), "1500");

    expect(screen.getByText("That's more than your 1,000-point balance.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy" })).toBeDisabled();
  });

  test("a stake exactly equal to the balance keeps submit enabled", async () => {
    const user = userEvent.setup();
    render(<BuyPanel market={binaryMarket()} balance={1000} />);

    await user.type(screen.getByLabelText("Stake"), "1000");

    expect(screen.getByRole("button", { name: "Buy Yes for 1000 points" })).not.toBeDisabled();
  });

  test("an empty stake disables submit without showing an error", () => {
    render(<BuyPanel market={binaryMarket()} balance={1000} />);

    expect(screen.getByRole("button", { name: "Buy" })).toBeDisabled();
    expect(screen.queryByText(/points balance\.$/)).not.toBeInTheDocument();
    expect(screen.getByText("You can stake up to 1,000 points.")).toBeInTheDocument();
  });

  test("a malformed or more-than-2-decimal stake disables submit with an inline error", async () => {
    const user = userEvent.setup();
    render(<BuyPanel market={binaryMarket()} balance={1000} />);

    await user.type(screen.getByLabelText("Stake"), "12.345");

    expect(screen.getByText("Enter a stake between 1 and 1,000 points.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy" })).toBeDisabled();
  });

  test('the "Max" control fills the stake with the full current balance', async () => {
    const user = userEvent.setup();
    render(<BuyPanel market={binaryMarket()} balance={1000} />);

    await user.click(screen.getByRole("button", { name: /maximum/ }));

    expect(screen.getByLabelText("Stake")).toHaveValue("1000");
  });
});

describe("buy panel: shares preview", () => {
  test("recomputes the shares preview (stake / bestAsk) as the stake input changes", async () => {
    const user = userEvent.setup();
    render(<BuyPanel market={binaryMarket({ bestAsk: "0.5" })} balance={1000} />);

    await user.type(screen.getByLabelText("Stake"), "100");
    expect(screen.getByText("≈ 200")).toBeInTheDocument();
    expect(screen.getByText("≈ 200 points")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Stake"));
    await user.type(screen.getByLabelText("Stake"), "50");
    expect(screen.getByText("≈ 100")).toBeInTheDocument();
  });

  test("recomputes the shares preview against the newly selected outcome's price", async () => {
    // The backend prices every outcome off the market's single bestAsk (see
    // buyPositionLot in src/server/positions.ts), so the computed share count
    // is unchanged across outcomes; only the "Pays if <outcome> wins" label
    // updates to match the newly selected outcome.
    const user = userEvent.setup();
    render(<BuyPanel market={binaryMarket({ bestAsk: "0.5" })} balance={1000} />);

    await user.type(screen.getByLabelText("Stake"), "100");
    expect(screen.getByText("Pays if Yes wins")).toBeInTheDocument();
    expect(screen.getByText("≈ 200 points")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^No/ }));

    expect(screen.getByText("Pays if No wins")).toBeInTheDocument();
    expect(screen.getByText("≈ 200 points")).toBeInTheDocument();
  });

  test("floors the displayed preview instead of rounding (matches domain division policy)", async () => {
    const user = userEvent.setup();
    render(<BuyPanel market={binaryMarket({ bestAsk: "0.3" })} balance={1000} />);

    await user.type(screen.getByLabelText("Stake"), "10");

    expect(screen.getByText("≈ 33.33")).toBeInTheDocument();
    expect(screen.queryByText("≈ 33.34")).not.toBeInTheDocument();
  });

  test("shows an em dash placeholder when stake is empty/invalid or no outcome is selected", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BuyPanel market={binaryMarket()} balance={1000} />);

    expect(screen.getAllByText("—")).toHaveLength(2);

    await user.type(screen.getByLabelText("Stake"), "12.345");
    expect(screen.getAllByText("—")).toHaveLength(2);

    rerender(<BuyPanel market={multiOutcomeMarket()} balance={1000} />);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});

describe("buy panel: price staleness caption", () => {
  test("shows no staleness caption when lastSyncedAt is within 90 seconds", () => {
    render(
      <BuyPanel
        market={binaryMarket({ lastSyncedAt: "2026-01-15T11:59:00.000Z" })}
        balance={1000}
      />
    );

    expect(screen.queryByText(/Prices synced/)).not.toBeInTheDocument();
  });

  test("shows the staleness caption once lastSyncedAt is older than 90 seconds", () => {
    render(
      <BuyPanel
        market={binaryMarket({ lastSyncedAt: "2026-01-15T11:57:30.000Z" })}
        balance={1000}
      />
    );

    expect(
      screen.getByText("Prices synced 2m ago — the live price may have moved.")
    ).toBeInTheDocument();
  });

  test("recomputes the caption during dwell time, not just at initial render", () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

    try {
      render(
        <BuyPanel
          market={binaryMarket({ lastSyncedAt: "2026-01-15T12:00:00.000Z" })}
          balance={1000}
        />
      );

      expect(screen.queryByText(/Prices synced/)).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(120_000);
      });

      expect(
        screen.getByText("Prices synced 2m ago — the live price may have moved.")
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
    }
  });
});

describe("buy panel: unavailable states", () => {
  test("renders an explanatory note instead of the form when the market is closed", () => {
    render(<BuyPanel market={binaryMarket({ closed: true })} balance={1000} />);

    expect(screen.getByText("This market is closed. Buying is unavailable.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Outcome" })).not.toBeInTheDocument();
  });

  test("renders an explanatory note instead of the form when the market is inactive", () => {
    render(<BuyPanel market={binaryMarket({ active: false })} balance={1000} />);

    expect(
      screen.getByText("This market is inactive right now. Buying is unavailable.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Outcome" })).not.toBeInTheDocument();
  });

  test("renders an empty-state note instead of the form when bestAsk is null", () => {
    render(<BuyPanel market={binaryMarket({ bestAsk: null })} balance={1000} />);

    expect(
      screen.getByText("No buy price available right now. Check back after the next price sync.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Outcome" })).not.toBeInTheDocument();
  });
});

describe("buy panel: submission lifecycle", () => {
  test("disables the stake input, outcome selector, and submit button while submitting", async () => {
    const user = userEvent.setup();
    let resolveFetch: (response: Response) => void = () => undefined;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    render(<BuyPanel market={binaryMarket()} balance={1000} />);

    await user.type(screen.getByLabelText("Stake"), "100");
    await user.click(screen.getByRole("button", { name: "Buy Yes for 100 points" }));

    expect(screen.getByLabelText("Stake")).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Yes/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^No/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Buying…" })).toBeDisabled();

    resolveFetch(successResponse());
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
  });

  test("surfaces the mapped human-readable message when the API returns an error code", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(errorResponse("INSUFFICIENT_BALANCE", 422));

    render(<BuyPanel market={binaryMarket()} balance={1000} />);

    await user.type(screen.getByLabelText("Stake"), "100");
    await user.click(screen.getByRole("button", { name: "Buy Yes for 100 points" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your balance is 1,000 points — lower your stake."
    );
  });

  test("re-enables the form and preserves entered values after an API error", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(errorResponse("MARKET_CLOSED", 409));

    render(<BuyPanel market={binaryMarket()} balance={1000} />);

    await user.type(screen.getByLabelText("Stake"), "100");
    await user.click(screen.getByRole("button", { name: "Buy Yes for 100 points" }));

    await screen.findByRole("alert");

    expect(screen.getByLabelText("Stake")).toHaveValue("100");
    expect(screen.getByLabelText("Stake")).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Buy Yes for 100 points" })).not.toBeDisabled();
  });

  test("shows a confirmation with the purchased lot and new balance after a successful buy", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(successResponse());

    render(<BuyPanel market={binaryMarket()} balance={1000} />);

    await user.type(screen.getByLabelText("Stake"), "100");
    await user.click(screen.getByRole("button", { name: "Buy Yes for 100 points" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Bought ≈ 200 Yes shares for 100 points.");
    expect(status).toHaveTextContent("New balance: 900 points.");
    expect(screen.getByRole("link", { name: "View portfolio" })).toHaveAttribute(
      "href",
      "/portfolio"
    );
    expect(screen.getByLabelText("Stake")).toHaveValue("");
  });

  test("triggers a balance refetch/refresh after a successful buy", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(successResponse());
    routerRefresh.mockClear();

    render(<BuyPanel market={binaryMarket()} balance={1000} />);

    await user.type(screen.getByLabelText("Stake"), "100");
    await user.click(screen.getByRole("button", { name: "Buy Yes for 100 points" }));

    await screen.findByRole("status");
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });
});

function binaryMarket(overrides: Partial<CachedMarket> = {}): CachedMarket {
  return {
    gammaId: "market-democrat-win-2028",
    eventGammaId: "event-election-2028",
    eventTitle: "2028 Election",
    category: "Politics",
    question: "Will a Democrat win the 2028 US presidential election?",
    slug: "democrat-win-2028",
    outcomes: ["Yes", "No"],
    outcomePrices: ["0.66", "0.34"],
    bestBid: "0.64",
    bestAsk: "0.66",
    lastTradePrice: "0.65",
    active: true,
    closed: false,
    endDate: "2028-11-08T00:00:00.000Z",
    volume: "900000",
    lastSyncedAt: "2026-01-15T12:00:00.000Z",
    ...overrides
  };
}

function multiOutcomeMarket(overrides: Partial<CachedMarket> = {}): CachedMarket {
  return binaryMarket({
    gammaId: "market-world-cup-winner",
    question: "Who will win the World Cup?",
    outcomes: ["France", "Brazil", "Japan"],
    outcomePrices: ["0.45", "0.35", "0.20"],
    bestAsk: "0.5",
    ...overrides
  });
}

function successResponse() {
  return new Response(
    JSON.stringify({
      position: {
        id: "lot_1",
        marketId: "market-democrat-win-2028",
        marketQuestion: "Will a Democrat win the 2028 US presidential election?",
        outcomeIndex: 0,
        outcomeLabel: "Yes",
        status: "OPEN",
        stake: "100",
        shares: "200",
        committedShares: "0",
        entryPrice: "0.5",
        purchasedAt: "2026-01-15T12:00:00.000Z"
      },
      balance: 900
    }),
    { status: 201, headers: { "content-type": "application/json" } }
  );
}

function errorResponse(code: string, status: number) {
  return new Response(JSON.stringify({ error: { code } }), {
    status,
    headers: { "content-type": "application/json" }
  });
}
