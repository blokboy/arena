import { describe, expect, test } from "vitest";

import { POST as register } from "@/app/api/auth/register/route";
import { GET as getMe } from "@/app/api/me/route";
import { verifyPassword } from "@/domain/auth";
import { userRepository } from "@/server/users";
import { jsonRequest } from "@test/helpers/api";

describe("auth API", () => {
  test("register creates a starting-balance user with a hashed password", async () => {
    const response = await register(
      jsonRequest("http://arena.test/api/auth/register", {
        username: "Casey",
        password: "long-enough",
        confirmPassword: "long-enough"
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      user: { username: "casey", balance: 1000 }
    });

    const stored = userRepository.findByUsername("casey");
    expect(stored?.passwordHash).not.toBe("long-enough");
    await expect(verifyPassword("long-enough", stored?.passwordHash ?? "")).resolves.toBe(true);
  });

  test("register returns structured duplicate username errors", async () => {
    const first = jsonRequest("http://arena.test/api/auth/register", {
      username: "casey",
      password: "long-enough",
      confirmPassword: "long-enough"
    });
    await register(first);

    const response = await register(
      jsonRequest("http://arena.test/api/auth/register", {
        username: "casey",
        password: "long-enough",
        confirmPassword: "long-enough"
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "USERNAME_TAKEN" }
    });
  });

  test("me route rejects anonymous callers and returns balance for authenticated callers", async () => {
    const anonymous = await getMe(new Request("http://arena.test/api/me"));
    expect(anonymous.status).toBe(401);

    const registered = await register(
      jsonRequest("http://arena.test/api/auth/register", {
        username: "mira",
        password: "long-enough",
        confirmPassword: "long-enough"
      })
    );
    const body = (await registered.json()) as { user: { id: string } };

    const response = await getMe(
      new Request("http://arena.test/api/me", {
        headers: { "x-test-user-id": body.user.id }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: { username: "mira", balance: 1000 }
    });
  });
});
