import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { MarketsClient } from "@/components/markets/markets-client";
import { MarketsBrowser } from "@/components/markets/markets-browser";
import type { CachedEvent } from "@/domain/markets";

describe("MarketsBrowser", () => {
  test("renders category tabs, expands events, and labels market prices", async () => {
    const onCategoryChange = vi.fn();

    render(
      <MarketsBrowser
        events={[cachedEvent()]}
        selectedCategory="Politics"
        status="success"
        onCategoryChange={onCategoryChange}
      />
    );

    expect(screen.getByRole("button", { name: "Politics" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Sports" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Crypto" }));
    expect(onCategoryChange).toHaveBeenCalledWith("Crypto");

    const expand = screen.getByRole("button", { name: "Show markets for 2028 Election" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText("Will a Democrat win the 2028 US presidential election?")
    ).not.toBeInTheDocument();

    await userEvent.click(expand);

    expect(expand).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText("Will a Democrat win the 2028 US presidential election?")
    ).toBeInTheDocument();
    expect(screen.getByText("Yes 58%")).toBeInTheDocument();
    expect(screen.getByText("No 42%")).toBeInTheDocument();
    expect(screen.getByText("Sell at 0.57")).toBeInTheDocument();
    expect(screen.getByText("Buy at 0.59")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Sell Will a Democrat win the 2028 US presidential election? at 0.57")
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Buy Will a Democrat win the 2028 US presidential election? at 0.59")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View market" })).toHaveAttribute(
      "href",
      "/markets/market-democrat-win-2028"
    );
  });

  test("renders loading skeletons and empty states", () => {
    const { rerender } = render(
      <MarketsBrowser
        events={[]}
        selectedCategory="Politics"
        status="loading"
        onCategoryChange={() => undefined}
      />
    );

    expect(screen.getAllByText("Loading market events")).toHaveLength(3);

    rerender(
      <MarketsBrowser
        events={[]}
        selectedCategory="Weather"
        status="success"
        onCategoryChange={() => undefined}
      />
    );

    expect(screen.getByText("No cached Weather events yet.")).toBeInTheDocument();
  });
});

describe("MarketsClient", () => {
  test("fetches cached markets through the local API when category changes", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ events: [cachedEvent()] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    render(<MarketsClient />);

    expect(await screen.findByText("2028 Election")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/markets?category=politics");

    await userEvent.click(screen.getByRole("button", { name: "Sports" }));

    expect(fetch).toHaveBeenCalledWith("/api/markets?category=sports");
    expect(fetch.mock.calls.some(([url]) => String(url).includes("gamma-api.polymarket.com"))).toBe(
      false
    );
  });
});

function cachedEvent(): CachedEvent {
  return {
    gammaId: "event-election-2028",
    category: "Politics",
    title: "2028 Election",
    slug: "2028-election",
    volume: "1500000",
    lastSyncedAt: "2026-07-06T12:00:00.000Z",
    markets: [
      {
        gammaId: "market-democrat-win-2028",
        eventGammaId: "event-election-2028",
        eventTitle: "2028 Election",
        category: "Politics",
        question: "Will a Democrat win the 2028 US presidential election?",
        slug: "democrat-win-2028",
        outcomes: ["Yes", "No"],
        outcomePrices: ["0.58", "0.42"],
        bestBid: "0.57",
        bestAsk: "0.59",
        lastTradePrice: "0.58",
        active: true,
        closed: false,
        endDate: "2028-11-08T00:00:00.000Z",
        volume: "900000",
        lastSyncedAt: "2026-07-06T12:00:00.000Z"
      }
    ]
  };
}
