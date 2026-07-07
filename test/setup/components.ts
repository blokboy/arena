import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});
