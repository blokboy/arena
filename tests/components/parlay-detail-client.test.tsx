import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { ParlayDetailClient } from "@/components/parlays/parlay-detail-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function mockDetailFetch(detail: unknown, positions: unknown[] = []) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url =
      typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();

    if (url.includes("/api/parlays/")) {
      return jsonResponse({ data: detail });
    }
    if (url.includes("/api/positions")) {
      return jsonResponse({ positions });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

const baseLeg = {
  outcomeIndex: 0,
  market: {
    gammaId: "market-1",
    question: "Will the Democrat win in 2028?",
    endDate: "2028-11-08T00:00:00.000Z",
    bestBid: "0.7",
    bestAsk: "0.72"
  },
  memberVoteTally: null
};

describe("ParlayDetailClient — settlement-driven terminal states", () => {
  test("does not show the locked-until-final copy on a leg that already rolled over", async () => {
    mockDetailFetch({
      id: "parlay-1",
      name: "Late Slate",
      status: "ACTIVE",
      members: [{ userId: "alice-id", username: "alice" }],
      legs: [
        {
          ...baseLeg,
          id: "leg-1",
          status: "ROLLED_OVER",
          stakes: [
            {
              user: { id: "alice-id", username: "alice" },
              amount: "64",
              shares: "100",
              averageEntryPrice: "0.64",
              status: "ROLLED_OVER"
            }
          ]
        },
        {
          ...baseLeg,
          id: "leg-2",
          status: "ACTIVE",
          stakes: [
            {
              user: { id: "alice-id", username: "alice" },
              amount: "70",
              shares: "97",
              averageEntryPrice: "0.72",
              status: "ACTIVE"
            }
          ]
        }
      ]
    });

    render(<ParlayDetailClient parlayId="parlay-1" currentUserId="alice-id" />);

    await waitFor(() => expect(screen.getByText("Late Slate")).toBeInTheDocument());

    const rolledOverRow = document.querySelector("#leg-leg-1");
    expect(rolledOverRow).not.toBeNull();
    expect(rolledOverRow?.textContent).not.toMatch(/locked until the final leg resolves/i);
  });

  test("still shows the locked-until-final copy on a pending leg", async () => {
    mockDetailFetch({
      id: "parlay-1",
      name: "Late Slate",
      status: "ACTIVE",
      members: [{ userId: "alice-id", username: "alice" }],
      legs: [
        {
          ...baseLeg,
          id: "leg-1",
          status: "ACTIVE",
          stakes: []
        },
        {
          ...baseLeg,
          id: "leg-2",
          status: "PENDING",
          stakes: []
        }
      ]
    });

    render(<ParlayDetailClient parlayId="parlay-1" currentUserId="alice-id" />);

    await waitFor(() => expect(screen.getByText("Late Slate")).toBeInTheDocument());

    const pendingRow = document.querySelector("#leg-leg-2");
    expect(pendingRow?.textContent).toMatch(/locked until the final leg resolves/i);
  });

  test("does not show the locked-until-final copy on a leg that already won or lost", async () => {
    mockDetailFetch({
      id: "parlay-1",
      name: "Late Slate",
      status: "WON",
      members: [{ userId: "alice-id", username: "alice" }],
      legs: [
        {
          ...baseLeg,
          id: "leg-1",
          status: "WON",
          stakes: []
        },
        {
          ...baseLeg,
          id: "leg-2",
          status: "LOST",
          stakes: []
        }
      ]
    });

    render(<ParlayDetailClient parlayId="parlay-1" currentUserId="alice-id" />);

    await waitFor(() => expect(screen.getByText("Late Slate")).toBeInTheDocument());

    expect(document.querySelector("#leg-leg-1")?.textContent).not.toMatch(
      /locked until the final leg resolves/i
    );
    expect(document.querySelector("#leg-leg-2")?.textContent).not.toMatch(
      /locked until the final leg resolves/i
    );
  });

  test("hides the append-leg action once the parlay reaches a terminal status", async () => {
    mockDetailFetch({
      id: "parlay-1",
      name: "Late Slate",
      status: "LOST",
      members: [{ userId: "alice-id", username: "alice" }],
      legs: [{ ...baseLeg, id: "leg-1", status: "LOST", stakes: [] }]
    });

    render(<ParlayDetailClient parlayId="parlay-1" currentUserId="alice-id" />);

    await waitFor(() => expect(screen.getByText("Late Slate")).toBeInTheDocument());

    expect(screen.queryByText(/append a leg/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /append leg/i })).not.toBeInTheDocument();
  });

  test("does not render any cash-out control anywhere on a terminal parlay", async () => {
    mockDetailFetch({
      id: "parlay-1",
      name: "Late Slate",
      status: "WON",
      members: [{ userId: "alice-id", username: "alice" }],
      legs: [{ ...baseLeg, id: "leg-1", status: "WON", stakes: [] }]
    });

    render(<ParlayDetailClient parlayId="parlay-1" currentUserId="alice-id" />);

    await waitFor(() => expect(screen.getByText("Late Slate")).toBeInTheDocument());

    expect(screen.queryByText(/cash out/i)).not.toBeInTheDocument();
  });
});

// Real values below are lifted directly from the backend's confirmed
// tests/integration/parlay-settlement.test.ts "GET /api/parlays/:id exposes
// settlement fields" seam, not from the pre-implementation contract doc —
// this is the integration-level pass against real serializer output.
describe("ParlayDetailClient — real settlement field values from the backend", () => {
  test("a won-final leg's stake shows its credited payout and no rollforward link", async () => {
    mockDetailFetch({
      id: "parlay-1",
      name: "July ladder",
      status: "WON",
      members: [{ userId: "mira-id", username: "mira" }],
      legs: [
        {
          ...baseLeg,
          id: "leg-1",
          status: "WON",
          stakes: [
            {
              user: { id: "mira-id", username: "mira" },
              amount: "250",
              shares: "390.625",
              averageEntryPrice: "0.64",
              status: "WON",
              payout: "390.625",
              rolledForwardFromLegId: null,
              rolledForwardToLegId: null
            }
          ]
        }
      ]
    });

    render(<ParlayDetailClient parlayId="parlay-1" currentUserId="mira-id" />);
    await waitFor(() => expect(screen.getByText("July ladder")).toBeInTheDocument());

    expect(screen.getByText(/paid out 390\.625/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /carried forward/i })).not.toBeInTheDocument();
  });

  test("a won-non-final leg's stake links forward, and the receiving leg links back — both visible, not just the active one", async () => {
    mockDetailFetch({
      id: "parlay-1",
      name: "July ladder",
      status: "ACTIVE",
      members: [{ userId: "mira-id", username: "mira" }],
      legs: [
        {
          ...baseLeg,
          id: "leg-1",
          status: "WON",
          stakes: [
            {
              user: { id: "mira-id", username: "mira" },
              amount: "250",
              shares: "390.625",
              averageEntryPrice: "0.64",
              status: "WON",
              payout: "0",
              rolledForwardFromLegId: null,
              rolledForwardToLegId: "leg-2"
            }
          ]
        },
        {
          ...baseLeg,
          id: "leg-2",
          status: "ACTIVE",
          stakes: [
            {
              user: { id: "mira-id", username: "mira" },
              amount: "400.625",
              shares: "625.976...",
              averageEntryPrice: "0.64",
              status: "ACTIVE",
              payout: "0",
              rolledForwardFromLegId: "leg-1",
              rolledForwardToLegId: null
            }
          ]
        }
      ]
    });

    render(<ParlayDetailClient parlayId="parlay-1" currentUserId="mira-id" />);
    await waitFor(() => expect(screen.getByText("July ladder")).toBeInTheDocument());

    expect(screen.queryByText(/paid out/i)).not.toBeInTheDocument();

    const forwardLink = screen.getByRole("link", { name: /carried forward/i });
    expect(forwardLink).toHaveAttribute("href", "#leg-leg-2");

    const backLink = screen.getByRole("link", { name: /proceeds from an earlier leg/i });
    expect(backLink).toHaveAttribute("href", "#leg-leg-1");
  });

  test("a lost leg's forfeited stake shows Lost with no payout copy, on every LOST leg including a cascaded pending one", async () => {
    mockDetailFetch({
      id: "parlay-1",
      name: "July ladder",
      status: "LOST",
      members: [{ userId: "mira-id", username: "mira" }],
      legs: [
        {
          ...baseLeg,
          id: "leg-1",
          status: "LOST",
          stakes: [
            {
              user: { id: "mira-id", username: "mira" },
              amount: "250",
              shares: "390.625",
              averageEntryPrice: "0.64",
              status: "LOST",
              payout: "0",
              rolledForwardFromLegId: null,
              rolledForwardToLegId: null
            }
          ]
        },
        {
          ...baseLeg,
          id: "leg-2",
          status: "LOST",
          stakes: [
            {
              user: { id: "mira-id", username: "mira" },
              amount: "10",
              shares: "15.625",
              averageEntryPrice: "0.64",
              status: "LOST",
              payout: "0",
              rolledForwardFromLegId: null,
              rolledForwardToLegId: null
            }
          ]
        }
      ]
    });

    render(<ParlayDetailClient parlayId="parlay-1" currentUserId="mira-id" />);
    await waitFor(() => expect(screen.getByText("July ladder")).toBeInTheDocument());

    // Each LOST leg renders its badge twice — once on the timeline row,
    // once on the backer-list stake row — across the two LOST legs here.
    expect(screen.getAllByText("Lost")).toHaveLength(4);
    expect(screen.queryByText(/paid out/i)).not.toBeInTheDocument();
  });

  test("a voided-final leg's stake shows its refunded payout", async () => {
    mockDetailFetch({
      id: "parlay-1",
      name: "July ladder",
      status: "VOIDED",
      members: [{ userId: "mira-id", username: "mira" }],
      legs: [
        {
          ...baseLeg,
          id: "leg-1",
          status: "VOIDED",
          stakes: [
            {
              user: { id: "mira-id", username: "mira" },
              amount: "250",
              shares: "390.625",
              averageEntryPrice: "0.64",
              status: "VOIDED_REFUNDED",
              payout: "250",
              rolledForwardFromLegId: null,
              rolledForwardToLegId: null
            }
          ]
        }
      ]
    });

    render(<ParlayDetailClient parlayId="parlay-1" currentUserId="mira-id" />);
    await waitFor(() => expect(screen.getByText("July ladder")).toBeInTheDocument());

    // Timeline badge + backer-list stake badge both render "Voided, refunded".
    expect(screen.getAllByText("Voided, refunded")).toHaveLength(2);
    expect(screen.getByText(/paid out 250/i)).toBeInTheDocument();
  });

  test("a voided-non-final leg passes value forward with no payout, same rollforward link as a win", async () => {
    mockDetailFetch({
      id: "parlay-1",
      name: "July ladder",
      status: "ACTIVE",
      members: [{ userId: "mira-id", username: "mira" }],
      legs: [
        {
          ...baseLeg,
          id: "leg-1",
          status: "VOIDED",
          stakes: [
            {
              user: { id: "mira-id", username: "mira" },
              amount: "250",
              shares: "390.625",
              averageEntryPrice: "0.64",
              status: "VOIDED_REFUNDED",
              payout: "0",
              rolledForwardFromLegId: null,
              rolledForwardToLegId: "leg-2"
            }
          ]
        },
        {
          ...baseLeg,
          id: "leg-2",
          status: "ACTIVE",
          stakes: [
            {
              user: { id: "mira-id", username: "mira" },
              amount: "260",
              shares: "406.25",
              averageEntryPrice: "0.64",
              status: "ACTIVE",
              payout: "0",
              rolledForwardFromLegId: "leg-1",
              rolledForwardToLegId: null
            }
          ]
        }
      ]
    });

    render(<ParlayDetailClient parlayId="parlay-1" currentUserId="mira-id" />);
    await waitFor(() => expect(screen.getByText("July ladder")).toBeInTheDocument());

    // Voided non-final renders as VOIDED, never ROLLED_OVER (Designer's call,
    // confirmed representable with existing badge props). Timeline badge +
    // backer-list stake badge both render "Voided, refunded" for leg-1.
    expect(screen.getAllByText("Voided, refunded")).toHaveLength(2);
    expect(screen.queryByText("Rolled over")).not.toBeInTheDocument();
    expect(screen.queryByText(/paid out/i)).not.toBeInTheDocument();

    const forwardLink = screen.getByRole("link", { name: /carried forward/i });
    expect(forwardLink).toHaveAttribute("href", "#leg-leg-2");
  });
});

describe("ParlayDetailClient — append a leg from portfolio holdings", () => {
  test("derives the appended leg's market/outcome from a chosen holding, not typed-in ids", async () => {
    const user = userEvent.setup();
    const calls: Array<{ url: string; body?: unknown }> = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined });

      if (url.includes("/api/parlays/parlay-1") && !url.includes("/legs")) {
        return jsonResponse({
          data: {
            id: "parlay-1",
            name: "July ladder",
            status: "ACTIVE",
            members: [{ userId: "mira-id", username: "mira" }],
            legs: [
              {
                ...baseLeg,
                id: "leg-1",
                status: "ACTIVE",
                stakes: [
                  {
                    user: { id: "mira-id", username: "mira" },
                    amount: "64",
                    shares: "100",
                    averageEntryPrice: "0.64",
                    status: "ACTIVE"
                  }
                ]
              }
            ]
          }
        });
      }

      if (url.endsWith("/api/positions")) {
        return jsonResponse({
          positions: [
            {
              id: "lot-2",
              marketId: "market-senate-2028",
              marketQuestion: "Will Democrats control the Senate after 2028?",
              outcomeIndex: 0,
              outcomeLabel: "Yes",
              status: "OPEN",
              stake: "10",
              shares: "15.625",
              committedShares: "0",
              entryPrice: "0.64",
              purchasedAt: "2026-07-08T11:00:00.000Z"
            }
          ]
        });
      }

      if (url.endsWith("/api/parlays/parlay-1/legs")) {
        expect(init?.method).toBe("POST");
        return jsonResponse({ leg: { id: "leg-2", status: "PENDING" } }, 201);
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    render(<ParlayDetailClient parlayId="parlay-1" currentUserId="mira-id" />);
    await waitFor(() => expect(screen.getByText("July ladder")).toBeInTheDocument());

    // The append form must offer the member's own holdings to choose from —
    // no raw "Market id"/"Outcome index" text inputs anywhere.
    expect(screen.queryByLabelText("Market id")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Outcome index")).not.toBeInTheDocument();
    expect(
      await screen.findByText("Will Democrats control the Senate after 2028?")
    ).toBeInTheDocument();
    expect(screen.getByText(/Yes · 15.625 shares available/)).toBeInTheDocument();

    const appendSection = screen.getByText("Append a leg").closest("section")!;
    await user.click(within(appendSection).getByRole("button", { name: "Choose" }));
    await user.type(await screen.findByLabelText(/lot-2|0\.64/i), "15.625");
    await user.click(within(appendSection).getByRole("button", { name: "Append leg" }));

    await waitFor(() =>
      expect(calls.some((call) => call.url.endsWith("/api/parlays/parlay-1/legs"))).toBe(true)
    );

    const legCall = calls.find((call) => call.url.endsWith("/api/parlays/parlay-1/legs"))!;
    expect(legCall.body).toEqual({
      marketId: "market-senate-2028",
      outcomeIndex: 0,
      commitments: [{ positionId: "lot-2", shares: "15.625" }]
    });
  });
});
