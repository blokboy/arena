import { afterEach, vi } from "vitest";

import { userRepository } from "@/server/users";
import { clearSessions } from "@/server/sessions";
import { marketCacheRepository, resetMarketGammaClientForTesting } from "@/server/markets";

vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

afterEach(() => {
  vi.restoreAllMocks();
  userRepository.clear();
  marketCacheRepository.clear();
  resetMarketGammaClientForTesting();
  clearSessions();
  delete process.env.CRON_SECRET;
});
