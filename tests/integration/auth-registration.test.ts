import { describe, expect, test } from "vitest";

import { hashPassword, verifyPassword } from "@/domain/auth";
import { STARTING_BALANCE } from "@/lib/money";
import { userRepository } from "@/server/users";

describe("registration persistence seam", () => {
  test("registration stores starting balance and never stores plaintext password", async () => {
    const passwordHash = await hashPassword("long-enough");
    const user = userRepository.createUser({ username: "jules", passwordHash });

    expect(user.balance).toBe(STARTING_BALANCE);
    expect(user.passwordHash).not.toBe("long-enough");
    await expect(verifyPassword("long-enough", user.passwordHash)).resolves.toBe(true);
  });
});
