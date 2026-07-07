/**
 * MSW request handlers for Polymarket's Gamma API.
 *
 * Tests must NEVER hit the real gamma-api.polymarket.com — the server in
 * ./server.ts is meant to be started with `onUnhandledRequest: "error"`, so
 * any code path that escapes these handlers fails the test instead of leaking
 * traffic.
 *
 * Handlers serve the recorded fixtures under test/fixtures/gamma/ in their
 * raw wire shape (stringified outcomes/outcomePrices, numeric prices). Add
 * per-test overrides with `gammaServer.use(...)` rather than editing these.
 */
import { HttpResponse, http } from "msw";

import eventPolitics from "../../fixtures/gamma/event-politics.json";
import marketOpenBinary from "../../fixtures/gamma/market-open-binary.json";
import marketResolvedBinary from "../../fixtures/gamma/market-resolved-binary.json";
import marketVoided from "../../fixtures/gamma/market-voided.json";

export const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";

const marketsById: Record<string, unknown> = {
  [marketOpenBinary.id]: marketOpenBinary,
  [marketResolvedBinary.id]: marketResolvedBinary,
  [marketVoided.id]: marketVoided
};

export const gammaHandlers = [
  // Discovery query used by the category sync cron (PRD Part I §1 / Part III §3).
  http.get(`${GAMMA_BASE_URL}/events`, ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get("tag_id") === "2") {
      return HttpResponse.json([eventPolitics]);
    }
    return HttpResponse.json([]);
  }),

  // Single-market refresh used by trade-time and settlement refetches.
  http.get(`${GAMMA_BASE_URL}/markets/:marketId`, ({ params }) => {
    const market = marketsById[String(params.marketId)];
    if (!market) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(market);
  })
];

/** Handler simulating Gamma rate-limiting, for backoff/degradation tests. */
export const gammaRateLimited = http.get(
  `${GAMMA_BASE_URL}/*`,
  () => new HttpResponse(null, { status: 429 })
);
