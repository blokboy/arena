import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AuthForm } from "@/components/auth-form";

const router = {
  push: vi.fn(),
  refresh: vi.fn()
};

vi.mock("next/navigation", () => ({
  useRouter: () => router
}));

describe("AuthForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    router.push.mockReset();
    router.refresh.mockReset();
  });

  test("uses real labels for auth fields", () => {
    render(<AuthForm mode="signup" />);

    expect(screen.getByLabelText("Username")).toHaveAttribute("name", "username");
    expect(screen.getByLabelText("Password")).toHaveAttribute("name", "password");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("name", "confirmPassword");
  });

  test("submits valid login credentials and navigates into the app", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response({ user: { id: "user_1", username: "casey", balance: 1000 } }));

    render(<AuthForm mode="login" />);

    await userEvent.type(screen.getByLabelText("Username"), "Casey");
    await userEvent.type(screen.getByLabelText("Password"), "long-enough");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(fetch).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "Casey", password: "long-enough" })
    });
    expect(router.push).toHaveBeenCalledWith("/markets");
    expect(router.refresh).toHaveBeenCalled();
  });

  test("submits valid signup details and navigates into the app", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response({ user: { id: "user_1", username: "casey", balance: 1000 } }));

    render(<AuthForm mode="signup" />);

    await userEvent.type(screen.getByLabelText("Username"), "Casey");
    await userEvent.type(screen.getByLabelText("Password"), "long-enough");
    await userEvent.type(screen.getByLabelText("Confirm password"), "long-enough");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(fetch).toHaveBeenCalledWith("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "Casey",
        password: "long-enough",
        confirmPassword: "long-enough"
      })
    });
    expect(router.push).toHaveBeenCalledWith("/markets");
    expect(router.refresh).toHaveBeenCalled();
  });

  test("shows generic login failure copy", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password." } },
        { status: 401 }
      )
    );

    render(<AuthForm mode="login" />);

    await userEvent.type(screen.getByLabelText("Username"), "casey");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid username or password.");
  });

  test("shows signup validation when username is missing", async () => {
    render(<AuthForm mode="signup" />);

    await userEvent.type(screen.getByLabelText("Password"), "long-enough");
    await userEvent.type(screen.getByLabelText("Confirm password"), "long-enough");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Choose a username.");
  });

  test("shows signup validation when username characters are invalid", async () => {
    render(<AuthForm mode="signup" />);

    await userEvent.type(screen.getByLabelText("Username"), "casey!");
    await userEvent.type(screen.getByLabelText("Password"), "long-enough");
    await userEvent.type(screen.getByLabelText("Confirm password"), "long-enough");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Use letters, numbers, underscores, or hyphens."
    );
  });

  test("shows signup validation when password is too short", async () => {
    render(<AuthForm mode="signup" />);

    await userEvent.type(screen.getByLabelText("Username"), "casey");
    await userEvent.type(screen.getByLabelText("Password"), "short");
    await userEvent.type(screen.getByLabelText("Confirm password"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Use at least 8 characters.");
  });

  test("shows signup validation when passwords do not match", async () => {
    render(<AuthForm mode="signup" />);

    await userEvent.type(screen.getByLabelText("Username"), "casey");
    await userEvent.type(screen.getByLabelText("Password"), "long-enough");
    await userEvent.type(screen.getByLabelText("Confirm password"), "different");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Passwords must match.");
  });

  test("shows duplicate username validation passed in from signup", () => {
    render(<AuthForm mode="signup" initialError="USERNAME_TAKEN" />);

    expect(screen.getByRole("alert")).toHaveTextContent("That username is already taken.");
  });
});

function response(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}
