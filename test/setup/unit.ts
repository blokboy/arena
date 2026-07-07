import { beforeEach, vi } from "vitest";

import { setMarketGammaClientForTesting } from "@/server/markets";

vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

beforeEach(() => {
  // Buy/sell's on-demand freshness refresh (see refreshMarketIfStale) would
  // otherwise fall through to the real Gamma API whenever a test fixture's
  // lastSyncedAt is more than a few seconds old relative to the mocked
  // system time above — slow and non-deterministic. Fail closed by default;
  // refreshMarketIfStale already treats a failed refresh as "serve the
  // cached price" (PRD Part III §6.3), so this is silent unless a test
  // explicitly overrides the client to assert on refresh behavior.
  setMarketGammaClientForTesting({
    fetchEventsByTag: vi.fn().mockRejectedValue(new Error("Gamma not mocked in this test")),
    fetchMarketById: vi.fn().mockRejectedValue(new Error("Gamma not mocked in this test"))
  });
});
