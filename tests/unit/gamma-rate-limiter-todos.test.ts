/**
 * Gamma caching/proxy + rate limiter (PRD Part III §3, §6.3).
 *
 * SKELETON: these pin the behavior of the server-side Gamma client (the
 * single module allowed to talk to Gamma) and its token-bucket limiter.
 * Specs here must run against the MSW harness (test/helpers/gamma/) — see
 * tests/unit/gamma-mock-harness.test.ts for the wiring; `gammaRateLimited`
 * in test/helpers/gamma/handlers.ts simulates 429s.
 *
 * A persistent token-bucket counter is integration-tier once the DB lands.
 */
import { describe, it } from "vitest";

describe("two-tier cache (server-side Gamma client)", () => {
  it.todo(
    "browse reads (/api/markets) are served from the cache only — zero Gamma calls per client request"
  );
  it.todo(
    "category sync upserts events/markets from the 9 discovery queries (9 requests per tick)"
  );
  it.todo("trade-time refresh skips Gamma when lastSyncedAt is within the 5s TTL");
  it.todo(
    "trade-time refresh hits Gamma exactly once when the TTL has expired, then updates lastSyncedAt"
  );
  it.todo("concurrent trade-time refreshes on the same hot market collapse to a single Gamma call");
});

describe("rate limiter + degradation (PRD §6.3)", () => {
  it.todo(
    "outbound Gamma calls are capped by the token bucket (budget ~45/min, headroom for cron)"
  );
  it.todo(
    "a limiter-skipped trade-time refresh serves the last-cached price with its lastSyncedAt — never fails the trade"
  );
  it.todo(
    "cron sync retries a 429 with exponential backoff + jitter for that market only, not the whole run"
  );
  it.todo("a Gamma 429 during settlement skips that market and continues the run");
});

describe("proxy boundary", () => {
  it.todo(
    "no module other than the server-side Gamma client constructs gamma-api.polymarket.com URLs"
  );
});
