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

// Leg 1 must be seeded from a market/outcome the creator already holds
// shares in — the flow fetches the creator's own portfolio (GET
// /api/positions, no marketId) once, derives a "holdings" list from it
// client-side, and never lets the creator browse the wider market catalog.
function mockFlowFetch(options?: { emptyHoldings?: boolean; failLegCreate?: boolean }) {
  const calls: string[] = [];

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
    calls.push(url);

    if (url.includes("/api/users?query=bo")) {
      return jsonResponse({ users: [{ id: "user_2", username: "bob" }] });
    }

    if (url.endsWith("/api/positions")) {
      return jsonResponse({
        positions: options?.emptyHoldings
          ? []
          : [
              {
                id: "lot-1",
                marketId: "market-1",
                marketQuestion: "Will a Democrat win the 2028 election?",
                outcomeIndex: 0,
                outcomeLabel: "Yes",
                status: "OPEN",
                stake: "50",
                shares: "120",
                committedShares: "0",
                entryPrice: "0.56",
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
  test("derives the first-leg market/outcome from the creator's own holdings, not a market browser", async () => {
    const user = userEvent.setup();
    const calls = mockFlowFetch();

    render(<ParlayCreateFlow currentUser={{ id: "user_1", username: "mira" }} />);

    await user.type(screen.getByLabelText("Parlay name"), "July ladder");
    await user.type(screen.getByPlaceholderText("Search by username"), "bo");
    await user.click(await screen.findByRole("button", { name: /add bob/i }));
    await user.click(screen.getByRole("button", { name: "Continue to first leg" }));

    // The held market/outcome appears as a holding to choose from — no
    // category tabs, no market browse list, no separate outcome picker.
    expect(await screen.findByText("Will a Democrat win the 2028 election?")).toBeInTheDocument();
    expect(screen.getByText(/Yes · 120 shares available/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Market categories")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Outcome" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Choose" }));
    await user.type(await screen.findByLabelText(/lot-1|0\.56/i), "50");
    await user.click(screen.getByRole("button", { name: "Create parlay" }));

    const dialog = await screen.findByRole("dialog", { name: "Commit shares to leg 1?" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/Will a Democrat win the 2028 election?/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Create parlay" }));

    await waitFor(() =>
      expect(calls).toEqual(expect.arrayContaining(["/api/parlays", "/api/parlays/parlay_1/legs"]))
    );
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/parlays"));
  });

  test("keeps a created draft hidden but resumable when the leg-creation call fails", async () => {
    const user = userEvent.setup();
    mockFlowFetch({ failLegCreate: true });

    render(<ParlayCreateFlow currentUser={{ id: "user_1", username: "mira" }} />);

    await user.type(screen.getByLabelText("Parlay name"), "Retry ladder");
    await user.click(screen.getByRole("button", { name: "Continue to first leg" }));
    await user.click(await screen.findByRole("button", { name: "Choose" }));
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

  test("shows a neutral empty state pointing to /markets when the creator holds nothing yet", async () => {
    const user = userEvent.setup();
    mockFlowFetch({ emptyHoldings: true });

    render(<ParlayCreateFlow currentUser={{ id: "user_1", username: "mira" }} />);

    await user.type(screen.getByLabelText("Parlay name"), "Empty ladder");
    await user.click(screen.getByRole("button", { name: "Continue to first leg" }));

    expect(await screen.findByText("You don't hold any open positions yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buy a position" })).toHaveAttribute(
      "href",
      "/markets"
    );
    expect(
      screen.getByText("Choose one of your holdings above before committing shares.")
    ).toBeInTheDocument();
  });
});
