import { describe, expect, test } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as getMe } from "@/app/api/me/route";
import { verifyPassword } from "@/domain/auth";
import { userRepository } from "@/server/users";
import { cookieHeader, jsonRequest } from "@test/helpers/api";

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

  test("register creates a session usable by me route", async () => {
    const registerResponse = await register(
      jsonRequest("http://arena.test/api/auth/register", {
        username: "jules",
        password: "long-enough",
        confirmPassword: "long-enough"
      })
    );

    expect(registerResponse.status).toBe(201);

    const response = await getMe(
      new Request("http://arena.test/api/me", {
        headers: { cookie: cookieHeader(registerResponse) }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: { username: "jules", balance: 1000 }
    });
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

  test("register returns structured validation errors", async () => {
    const response = await register(
      jsonRequest("http://arena.test/api/auth/register", {
        username: "!",
        password: "short",
        confirmPassword: "different"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        ok: false,
        code: "USERNAME_INVALID",
        message: "Use letters, numbers, underscores, or hyphens."
      }
    });
  });

  test("credential login failure returns generic copy", async () => {
    const response = await login(
      jsonRequest("http://arena.test/api/auth/login", {
        username: "unknown",
        password: "long-enough"
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid username or password."
      }
    });
  });

  test("successful login produces a session usable by me route", async () => {
    await register(
      jsonRequest("http://arena.test/api/auth/register", {
        username: "mira",
        password: "long-enough",
        confirmPassword: "long-enough"
      })
    );

    const loginResponse = await login(
      jsonRequest("http://arena.test/api/auth/login", {
        username: "mira",
        password: "long-enough"
      })
    );

    expect(loginResponse.status).toBe(200);

    const response = await getMe(
      new Request("http://arena.test/api/me", {
        headers: { cookie: cookieHeader(loginResponse) }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: { username: "mira", balance: 1000 }
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

  test("logout clears the session", async () => {
    await register(
      jsonRequest("http://arena.test/api/auth/register", {
        username: "niko",
        password: "long-enough",
        confirmPassword: "long-enough"
      })
    );
    const loginResponse = await login(
      jsonRequest("http://arena.test/api/auth/login", {
        username: "niko",
        password: "long-enough"
      })
    );

    const logoutResponse = await logout(
      new Request("http://arena.test/api/auth/logout", {
        method: "POST",
        headers: { cookie: cookieHeader(loginResponse) }
      })
    );

    expect(logoutResponse.status).toBe(303);
    expect(logoutResponse.headers.get("location")).toBe("http://arena.test/login");

    const response = await getMe(
      new Request("http://arena.test/api/me", {
        headers: { cookie: cookieHeader(logoutResponse) }
      })
    );
    expect(response.status).toBe(401);
  });
});
