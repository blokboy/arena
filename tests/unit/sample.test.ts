import { expect, test } from "vitest";

import { addPoints } from "@/domain/sample";

test("unit test harness adds independent point literals", () => {
  expect(addPoints(600, 400)).toBe(1000);
});
