import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { PortfolioClient } from "@/components/positions/portfolio-client";

const { routerRefresh } = vi.hoisted(() => ({ routerRefresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh })
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function mockPositionsFetch(positions: unknown[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({ positions }));
}

const baseLot = {
  id: "lot-1",
  marketId: "market-1",
  marketQuestion: "Will the Democrat win in 2028?",
  outcomeIndex: 0,
  outcomeLabel: "Yes",
  status: "OPEN" as const,
  stake: "64",
  entryPrice: "0.64",
  purchasedAt: "2026-07-06T10:00:00.000Z",
  currentBestBid: "0.7",
  currentBestAsk: "0.72",
  marketActive: true,
  marketClosed: false,
  lastSyncedAt: "2026-07-08T10:00:00.000Z"
};

describe("PortfolioClient — committed-then-settled shares (issue #11)", () => {
  test("a position whose committed shares already resolved through a parlay leg reads as resolved, not merely locked-pending, in the actual Open positions tree", async () => {
    mockPositionsFetch([
      {
        ...baseLot,
        shares: "100",
        committedShares: "100",
        availableShares: "0",
        currentSellValue: null,
        committedSettled: true
      }
    ]);

    render(<PortfolioClient />);

    await waitFor(() => expect(screen.getByText("Will the Democrat win in 2028?")).toBeInTheDocument());

    expect(screen.getByText(/100 locked/)).toBeInTheDocument();
    expect(screen.getByText(/resolved via parlay, no longer available/i)).toBeInTheDocument();
    expect(screen.queryByText(/·\s*not sellable/)).not.toBeInTheDocument();
  });

  test("a position still mid-chain (committed but not yet settled) keeps the pending-lock copy, not the resolved copy", async () => {
    mockPositionsFetch([
      {
        ...baseLot,
        shares: "100",
        committedShares: "60",
        availableShares: "40",
        currentSellValue: "28",
        committedSettled: false
      }
    ]);

    render(<PortfolioClient />);

    await waitFor(() => expect(screen.getByText("Will the Democrat win in 2028?")).toBeInTheDocument());

    expect(screen.getByText(/60 locked/)).toBeInTheDocument();
    expect(screen.getByText(/not sellable/)).toBeInTheDocument();
    expect(screen.queryByText(/resolved via parlay/i)).not.toBeInTheDocument();
  });
});
