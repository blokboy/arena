import { describe, expect, test } from "vitest";

import {
  AUTH_ERROR_MESSAGES,
  authError,
  hashPassword,
  validateSignup,
  verifyCredentials
} from "@/domain/auth";

describe("signup validation", () => {
  test("normalizes valid usernames and returns starting balance", () => {
    expect(
      validateSignup({
        username: "  Taren_01 ",
        password: "long-enough",
        confirmPassword: "long-enough"
      })
    ).toEqual({ ok: true, username: "taren_01", balance: 1000 });
  });

  test("rejects weak passwords before persistence", () => {
    expect(
      validateSignup({ username: "taren", password: "short", confirmPassword: "short" })
    ).toMatchObject({ ok: false, code: "PASSWORD_TOO_SHORT" });
  });

  test("maps signup validation failures to stable structured errors", () => {
    expect(AUTH_ERROR_MESSAGES).toEqual({
      USERNAME_REQUIRED: "Choose a username.",
      USERNAME_INVALID: "Use letters, numbers, underscores, or hyphens.",
      PASSWORD_TOO_SHORT: "Use at least 8 characters.",
      PASSWORD_MISMATCH: "Passwords must match.",
      USERNAME_TAKEN: "That username is already taken.",
      INVALID_CREDENTIALS: "Invalid username or password."
    });

    expect(
      validateSignup({ username: "", password: "long-enough", confirmPassword: "long-enough" })
    ).toEqual(authError("USERNAME_REQUIRED"));
    expect(
      validateSignup({
        username: "no spaces",
        password: "long-enough",
        confirmPassword: "long-enough"
      })
    ).toEqual(authError("USERNAME_INVALID"));
    expect(
      validateSignup({ username: "taren", password: "long-enough", confirmPassword: "different" })
    ).toEqual(authError("PASSWORD_MISMATCH"));
  });

  test("maps login failures to generic copy", () => {
    expect(authError("INVALID_CREDENTIALS")).toEqual({
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: "Invalid username or password."
    });
  });
});

describe("credential verification", () => {
  test("returns the user for a valid normalized username and password", async () => {
    const passwordHash = await hashPassword("correct-password");
    const user = { id: "user_1", username: "casey", passwordHash, balance: 1000 };

    await expect(
      verifyCredentials(
        { username: "  Casey ", password: "correct-password" },
        { findByUsername: (username) => (username === "casey" ? user : undefined) }
      )
    ).resolves.toEqual({ ok: true, user });
  });

  test("uses generic invalid-login behavior for missing users and bad passwords", async () => {
    const passwordHash = await hashPassword("correct-password");
    const user = { id: "user_1", username: "casey", passwordHash, balance: 1000 };
    const users = {
      findByUsername: (username: string) => (username === "casey" ? user : undefined)
    };

    await expect(
      verifyCredentials({ username: "casey", password: "wrong-password" }, users)
    ).resolves.toEqual(authError("INVALID_CREDENTIALS"));

    await expect(
      verifyCredentials({ username: "missing", password: "correct-password" }, users)
    ).resolves.toEqual(authError("INVALID_CREDENTIALS"));
  });
});
