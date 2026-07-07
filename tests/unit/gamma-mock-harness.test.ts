/**
 * Gamma HTTP mocking harness smoke test.
 *
 * Proves the MSW layer that every Gamma-touching test must go through:
 *   1. fixtures are served for the discovery and single-market endpoints, and
 *   2. any request that escapes the handlers FAILS the test
 *      (onUnhandledRequest: "error") — the executable form of the rule that
 *      tests never hit the real gamma-api.polymarket.com.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { GAMMA_BASE_URL } from "../../test/helpers/gamma/handlers";
import { gammaServer } from "../../test/helpers/gamma/server";

beforeAll(() => gammaServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => gammaServer.resetHandlers());
afterAll(() => gammaServer.close());

describe("gamma MSW harness", () => {
  it("serves the politics discovery query from fixtures", async () => {
    const res = await fetch(
      `${GAMMA_BASE_URL}/events?tag_id=2&active=true&closed=false&order=volume&ascending=false&limit=10`
    );
    const events = (await res.json()) as Array<{ id: string; markets: unknown[] }>;
    expect(events).toHaveLength(1);
    expect(events[0]?.markets.length).toBeGreaterThan(0);
  });

  it("serves a single market by id", async () => {
    const res = await fetch(`${GAMMA_BASE_URL}/markets/500001`);
    const market = (await res.json()) as { question: string; closed: boolean };
    expect(market.closed).toBe(false);
    expect(market.question).toMatch(/incumbent/);
  });

  it("404s unknown market ids through the mock, not the network", async () => {
    const res = await fetch(`${GAMMA_BASE_URL}/markets/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it("rejects requests no handler covers instead of letting them reach the network", async () => {
    await expect(fetch("https://example.com/definitely-not-mocked")).rejects.toThrow();
  });
});
