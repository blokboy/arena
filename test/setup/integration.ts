import { afterEach, vi } from "vitest";

import { userRepository } from "@/server/users";
import { positionRepository } from "@/server/positions";

vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

afterEach(() => {
  userRepository.clear();
  positionRepository.clear();
});
