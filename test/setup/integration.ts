import { afterEach, beforeEach, vi } from "vitest";

import {
  marketCacheRepository,
  resetMarketGammaClientForTesting,
  setMarketGammaClientForTesting
} from "@/server/markets";
import { positionRepository } from "@/server/positions";
import { userRepository } from "@/server/users";

vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

beforeEach(() => {
  // See test/setup/unit.ts — fail closed on real Gamma calls by default.
  setMarketGammaClientForTesting({
    fetchEventsByTag: vi.fn().mockRejectedValue(new Error("Gamma not mocked in this test")),
    fetchMarketById: vi.fn().mockRejectedValue(new Error("Gamma not mocked in this test"))
  });
});

afterEach(async () => {
  // Order matters against real Postgres: Position has FKs into both User
  // and CachedMarket, so it must be cleared first.
  await positionRepository.clear();
  await userRepository.clear();
  await marketCacheRepository.clear();
  resetMarketGammaClientForTesting();
});
