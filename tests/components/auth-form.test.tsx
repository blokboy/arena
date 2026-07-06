import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { AuthForm } from "@/components/auth-form";

describe("AuthForm", () => {
  test("shows generic login failure copy", async () => {
    render(<AuthForm mode="login" />);

    await userEvent.type(screen.getByLabelText("Username"), "casey");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid username or password.");
  });

  test("shows signup field validation", async () => {
    render(<AuthForm mode="signup" />);

    await userEvent.type(screen.getByLabelText("Username"), "casey");
    await userEvent.type(screen.getByLabelText("Password"), "short");
    await userEvent.type(screen.getByLabelText("Confirm password"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Use at least 8 characters.");
  });
});
