import { describe, expect, test } from "vitest";

import { authError, validateSignup } from "@/domain/auth";

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

  test("maps login failures to generic copy", () => {
    expect(authError("INVALID_CREDENTIALS")).toEqual({
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: "Invalid username or password."
    });
  });
});
