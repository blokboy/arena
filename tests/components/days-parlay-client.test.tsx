import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, afterEach } from "vitest";

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

const CURRENT_USER_ID = "user-1";

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
    globalThis.fetch = originalFetch;
  });

  test("shows loading state initially", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    render(<DaysParlayClient currentUserId={CURRENT_USER_ID} />);
    expect(screen.getByText(/loading day's parlay/i)).toBeInTheDocument();
  });

  test("shows error state when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    render(<DaysParlayClient currentUserId={CURRENT_USER_ID} />);
    await waitFor(() => {
      expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    });
  });

  test("renders the parlay name and leg count", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient currentUserId={CURRENT_USER_ID} />);

    await waitFor(() => {
      expect(screen.getByText("Day's Parlay 2026-07-10")).toBeInTheDocument();
      expect(screen.getByText(/1 leg/)).toBeInTheDocument();
    });
  });

  test("renders HOUSE balance stat with 50% bonus pool", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient currentUserId={CURRENT_USER_ID} />);

    await waitFor(() => {
      expect(screen.getByText("HOUSE balance")).toBeInTheDocument();
      expect(screen.getByText("500.00")).toBeInTheDocument();
      expect(screen.getByText(/50%.*250\.00.*today's bonus pool/i)).toBeInTheDocument();
    });
  });

  test("renders rollover counter", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient currentUserId={CURRENT_USER_ID} />);

    await waitFor(() => {
      expect(screen.getByText("1 of 3 rollovers used today")).toBeInTheDocument();
    });
  });

  test("renders the active leg with backer info", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient currentUserId={CURRENT_USER_ID} />);

    await waitFor(() => {
      expect(screen.getByText("Active leg")).toBeInTheDocument();
      expect(screen.getByText("alice")).toBeInTheDocument();
    });
  });

  test("renders the locked-share warning on active/pending legs", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient currentUserId={CURRENT_USER_ID} />);

    await waitFor(() => {
      const warnings = screen.getAllByText(/other users.*earlier legs can fail first/i);
      expect(warnings.length).toBeGreaterThanOrEqual(1);
    });
  });

  test("renders the claim picker section when parlay is ACTIVE", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient currentUserId={CURRENT_USER_ID} />);

    await waitFor(() => {
      expect(screen.getByText("Claim a market")).toBeInTheDocument();
    });
  });

  test("does not render claim picker when parlay is not ACTIVE", async () => {
    stubFetch({ ...mockDetail, status: "WON" });
    render(<DaysParlayClient currentUserId={CURRENT_USER_ID} />);

    await waitFor(() => {
      expect(screen.queryByText("Claim a market")).not.toBeInTheDocument();
    });
  });

  test("renders the vote status header as unspent when myVote is null", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient currentUserId={CURRENT_USER_ID} />);

    await waitFor(() => {
      expect(screen.getByText("Your vote: unspent")).toBeInTheDocument();
    });
  });

  test("renders the read-only headcount tally on the active, non-final leg", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient currentUserId={CURRENT_USER_ID} />);

    await waitFor(() => {
      expect(
        screen.getByText(/1 of 1 backer voted to roll over \(needs 1 to pass\)/i)
      ).toBeInTheDocument();
    });
  });

  test("renders VoteSpendButton for a leg the caller backed when the vote is unspent", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient currentUserId={CURRENT_USER_ID} />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Spend your rollover vote on this leg" })
      ).toBeInTheDocument();
    });
  });

  test("does not render any vote control for a leg the caller has not backed", async () => {
    stubFetch(mockDetail);
    render(<DaysParlayClient currentUserId="someone-else" />);

    await waitFor(() => {
      expect(screen.getByText("Active leg")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Spend your rollover vote on this leg" })
    ).not.toBeInTheDocument();
  });

  test("does not render rollover controls on the final leg", async () => {
    stubFetch({
      ...mockDetail,
      legs: [{ ...mockDetail.legs[0]!, isFinalLeg: true }]
    });
    render(<DaysParlayClient currentUserId={CURRENT_USER_ID} />);

    await waitFor(() => {
      expect(screen.getByText("Active leg")).toBeInTheDocument();
    });
    expect(screen.queryByText(/backer.*voted to roll over/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Spend your rollover vote on this leg" })
    ).not.toBeInTheDocument();
  });

  test("renders the vote-spent-here state on the leg the caller spent their vote on", async () => {
    stubFetch({
      ...mockDetail,
      myVote: { legId: "leg-1", marketQuestion: "Will it rain tomorrow?" }
    });
    render(<DaysParlayClient currentUserId={CURRENT_USER_ID} />);

    await waitFor(() => {
      expect(
        screen.getByText("Your vote: spent on Leg 1: Will it rain tomorrow?")
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/vote spent here/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Spend your rollover vote on this leg" })
    ).not.toBeInTheDocument();
  });

  test("renders a disabled-with-reason control on other backed legs once a vote is spent elsewhere", async () => {
    stubFetch({
      ...mockDetail,
      legs: [
        mockDetail.legs[0]!,
        {
          id: "leg-2",
          outcomeIndex: 0,
          status: "PENDING",
          claimedBy: null,
          market: {
            gammaId: "gamma-2",
            question: "Will the second market resolve yes?",
            outcomes: ["Yes", "No"],
            outcomePrices: ["0.5", "0.5"],
            endDate: "2026-07-10T20:00:00.000Z",
            lastSyncedAt: "2026-07-10T12:00:00.000Z",
            bestBid: "0.48",
            bestAsk: "0.52"
          },
          stakes: [],
          tally: { yesCount: 0, totalBackerCount: 0 },
          isFinalLeg: true
        }
      ],
      myVote: { legId: "leg-2", marketQuestion: "Will the second market resolve yes?" }
    });
    render(<DaysParlayClient currentUserId={CURRENT_USER_ID} />);

    await waitFor(() => {
      expect(screen.getByText("You've already spent today's vote on Leg 2")).toBeInTheDocument();
    });

    const disabledButton = screen.getByRole("button", {
      name: "Spend your rollover vote on this leg"
    });
    expect(disabledButton).toHaveAttribute("aria-disabled", "true");
    expect(disabledButton).toHaveAttribute("aria-describedby");
    const describedBy = disabledButton.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "You've already spent today's vote on Leg 2"
    );
  });
});
