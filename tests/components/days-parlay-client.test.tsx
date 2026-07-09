import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

import { DaysParlayClient } from "@/components/days-parlay/days-parlay-client";
import type { DaysParlayDetail } from "@/server/days-parlay";

const mockDetail: DaysParlayDetail = {
  id: "parlay-1",
  name: "Day's Parlay 2026-07-10",
  kind: "DAYS_PARLAY",
  dayKey: "2026-07-10",
  status: "ACTIVE",
  rolloverCount: 1,
  legs: [
    {
      id: "leg-1",
      outcomeIndex: 0,
      status: "ACTIVE",
      claimedBy: { id: "user-1", username: "alice" },
      market: {
        gammaId: "gamma-1",
        question: "Will it rain tomorrow?",
        outcomes: ["Yes", "No"],
        outcomePrices: ["0.6", "0.4"],
        endDate: "2026-07-10T18:00:00.000Z",
        lastSyncedAt: "2026-07-10T12:00:00.000Z",
        bestBid: "0.58",
        bestAsk: "0.62"
      },
      stakes: [
        {
          user: { id: "user-1", username: "alice" },
          amount: "10",
          shares: "18.18",
          averageEntryPrice: "0.55",
          status: "ACTIVE"
        }
      ],
      tally: { yesCount: 1, totalBackerCount: 1 },
      isFinalLeg: false
    }
  ],
  eligibleEvents: [],
  myVote: null,
  houseBalance: "500",
  myContributedPrincipal: "10",
  totalContributedPrincipal: "10"
};

const originalFetch = globalThis.fetch;

function stubFetch(detail: DaysParlayDetail) {
  vi.spyOn(globalThis, "fetch").mockImplementation((url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (urlStr.includes("/api/days-parlay")) {
      return Promise.resolve(new Response(JSON.stringify({ data: detail }), { status: 200 }));
    }
    if (urlStr.includes("/api/positions")) {
      return Promise.resolve(new Response(JSON.stringify({ positions: [] }), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
  });
}

describe("DaysParlayClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("shows loading state initially", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    render(<DaysParlayClient />);
    expect(screen.getByText(/loading day's parlay/i)).toBeInTheDocument();
  });

  test("shows error state when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    render(<DaysParlayClient />);
    await waitFor(() => {
      expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    });
  });

  test("renders the parlay name and leg count", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient />);

    await waitFor(() => {
      expect(screen.getByText("Day's Parlay 2026-07-10")).toBeInTheDocument();
      expect(screen.getByText(/1 leg/)).toBeInTheDocument();
    });
  });

  test("renders HOUSE balance stat with 50% bonus pool", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient />);

    await waitFor(() => {
      expect(screen.getByText("HOUSE balance")).toBeInTheDocument();
      expect(screen.getByText("500.00")).toBeInTheDocument();
      expect(screen.getByText(/50%.*250\.00.*today's bonus pool/i)).toBeInTheDocument();
    });
  });

  test("renders rollover counter", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient />);

    await waitFor(() => {
      expect(screen.getByText("1 of 3 rollovers used today")).toBeInTheDocument();
    });
  });

  test("renders the active leg with backer info", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient />);

    await waitFor(() => {
      expect(screen.getByText("Active leg")).toBeInTheDocument();
      expect(screen.getByText("alice")).toBeInTheDocument();
    });
  });

  test("renders the locked-share warning on active/pending legs", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient />);

    await waitFor(() => {
      const warnings = screen.getAllByText(/other users.*earlier legs can fail first/i);
      expect(warnings.length).toBeGreaterThanOrEqual(1);
    });
  });

  test("renders the claim picker section when parlay is ACTIVE", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient />);

    await waitFor(() => {
      expect(screen.getByText("Claim a market")).toBeInTheDocument();
    });
  });

  test("does not render claim picker when parlay is not ACTIVE", async () => {
    stubFetch({ ...mockDetail, status: "WON" });
    render(<DaysParlayClient />);

    await waitFor(() => {
      expect(screen.queryByText("Claim a market")).not.toBeInTheDocument();
    });
  });
});
