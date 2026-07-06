import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { AppShell } from "@/components/app-shell";

describe("AppShell", () => {
  test("renders navigation, current balance, and current nav state", () => {
    render(
      <AppShell currentPath="/markets" user={{ username: "mira", balance: 1000 }}>
        <h1>Markets</h1>
      </AppShell>
    );

    expect(screen.getByText("Signed in as mira")).toBeInTheDocument();
    expect(screen.getByText("1,000")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Markets" })).toHaveAttribute("aria-current", "page");
  });

  test("renders the starting balance banner once when requested", () => {
    render(
      <AppShell
        currentPath="/markets"
        user={{ username: "mira", balance: 1000, showStartingBalance: true }}
      >
        <h1>Markets</h1>
      </AppShell>
    );

    expect(screen.getByText("You are starting with 1,000 points.")).toBeInTheDocument();
  });
});
