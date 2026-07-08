import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { ParlayCreateFlow } from "@/components/parlays/parlay-create-flow";

const { routerPush, routerRefresh } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    refresh: routerRefresh
  })
}));

function mockFlowFetch(options?: { emptyEligibleLots?: boolean; failLegCreate?: boolean }) {
  const calls: string[] = [];

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
    calls.push(url);

    if (url.includes("/api/markets?category=politics")) {
      return jsonResponse({
        events: [
          {
            gammaId: "event-1",
            category: "Politics",
            title: "Election",
            slug: "election",
            volume: "1000",
            lastSyncedAt: "2026-07-08T12:00:00.000Z",
            markets: [
              {
                gammaId: "market-1",
                eventGammaId: "event-1",
                eventTitle: "Election",
                category: "Politics",
                question: "Will a Democrat win the 2028 election?",
                slug: "democrat-2028",
                outcomes: ["Yes", "No"],
                outcomePrices: ["0.56", "0.44"],
                bestBid: "0.54",
                bestAsk: "0.56",
                lastTradePrice: "0.55",
                active: true,
                closed: false,
                endDate: "2028-11-08T00:00:00.000Z",
                volume: "1000",
                lastSyncedAt: "2026-07-08T12:00:00.000Z"
              }
            ]
          }
        ]
      });
    }

    if (url.includes("/api/users?query=bo")) {
      return jsonResponse({ users: [{ id: "user_2", username: "bob" }] });
    }

    if (url.includes("/api/positions?marketId=market-1")) {
      return jsonResponse({
        positions: options?.emptyEligibleLots
          ? []
          : [
              {
                id: "lot-1",
                marketId: "market-1",
                marketQuestion: "Will a Democrat win the 2028 election?",
                outcomeIndex: 0,
                outcomeLabel: "Yes",
                status: "OPEN",
                entryPrice: "0.56",
                availableShares: "120",
                committedShares: "0",
                purchasedAt: "2026-07-08T11:00:00.000Z"
              }
            ]
      });
    }

    if (url.endsWith("/api/parlays")) {
      expect(init?.method).toBe("POST");
      return jsonResponse({ parlay: { id: "parlay_1" } }, 201);
    }

    if (url.endsWith("/api/parlays/parlay_1/legs")) {
      expect(init?.method).toBe("POST");
      if (options?.failLegCreate) {
        return jsonResponse({ error: { code: "COMMITMENT_EXCEEDS_AVAILABLE_SHARES" } }, 422);
      }

      return jsonResponse({ leg: { id: "leg_1", status: "ACTIVE" } }, 201);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  return calls;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("ParlayCreateFlow", () => {
  test("creates the draft parlay, then leg 1, then redirects to /parlays", async () => {
    const user = userEvent.setup();
    const calls = mockFlowFetch();

    render(<ParlayCreateFlow currentUser={{ id: "user_1", username: "mira" }} />);

    await user.type(screen.getByLabelText("Parlay name"), "July ladder");
    await user.type(screen.getByPlaceholderText("Search by username"), "bo");
    await user.click(await screen.findByRole("button", { name: /add bob/i }));
    await user.click(screen.getByRole("button", { name: "Continue to first leg" }));

    await user.click(await screen.findByRole("button", { name: "Choose market" }));
    await user.type(await screen.findByLabelText(/lot-1|0\.56/i), "50");
    await user.click(screen.getByRole("button", { name: "Create parlay" }));

    const dialog = await screen.findByRole("dialog", { name: "Commit shares to leg 1?" });
    expect(dialog).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Create parlay" }));

    await waitFor(() =>
      expect(calls).toEqual(
        expect.arrayContaining([
          "/api/parlays",
          "/api/parlays/parlay_1/legs"
        ])
      )
    );
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/parlays"));
  });

  test("keeps a created draft hidden but resumable when the leg-creation call fails", async () => {
    const user = userEvent.setup();
    mockFlowFetch({ failLegCreate: true });

    render(<ParlayCreateFlow currentUser={{ id: "user_1", username: "mira" }} />);

    await user.type(screen.getByLabelText("Parlay name"), "Retry ladder");
    await user.click(screen.getByRole("button", { name: "Continue to first leg" }));
    await user.click(await screen.findByRole("button", { name: "Choose market" }));
    await user.type(await screen.findByLabelText(/lot-1|0\.56/i), "50");
    await user.click(screen.getByRole("button", { name: "Create parlay" }));
    const dialog = await screen.findByRole("dialog", { name: "Commit shares to leg 1?" });
    await user.click(within(dialog).getByRole("button", { name: "Create parlay" }));

    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Leave draft for later" })).toHaveAttribute(
      "href",
      "/parlays"
    );
    expect(routerPush).not.toHaveBeenCalled();
  });

  test("shows the no-eligible-lots empty state when nothing can be committed", async () => {
    const user = userEvent.setup();
    mockFlowFetch({ emptyEligibleLots: true });

    render(<ParlayCreateFlow currentUser={{ id: "user_1", username: "mira" }} />);

    await user.type(screen.getByLabelText("Parlay name"), "Empty ladder");
    await user.click(screen.getByRole("button", { name: "Continue to first leg" }));
    await user.click(await screen.findByRole("button", { name: "Choose market" }));

    expect(await screen.findByText("No eligible open lots are available for this outcome.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buy a position" })).toHaveAttribute("href", "/markets");
    expect(screen.getByRole("link", { name: "Review your portfolio" })).toHaveAttribute("href", "/portfolio");
  });
});
