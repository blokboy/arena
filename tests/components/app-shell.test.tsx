import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { AppShell } from "@/components/app-shell";

describe("AppShell", () => {
  test("renders navigation, current balance, and current nav state", () => {
    render(
      <AppShell currentPath="/markets" user={{ id: "user_1", username: "mira", balance: 1000 }}>
        <h1>Markets</h1>
      </AppShell>
    );

    expect(screen.getByText("Signed in as mira")).toBeInTheDocument();
    expect(screen.getByText("1,000")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Portfolio" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Parlays" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Day's Parlay" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Leaderboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Markets" })).toHaveAttribute("aria-current", "page");
  });

  test("keeps the parent nav item current on nested app routes", () => {
    render(
      <AppShell
        currentPath="/markets/polymarket-event-1"
        user={{ id: "user_1", username: "mira", balance: 1234.5 }}
      >
        <h1>Market detail</h1>
      </AppShell>
    );

    expect(screen.getByRole("link", { name: "Markets" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("1,234.5")).toBeInTheDocument();
  });

  test("renders the starting balance banner once when requested", () => {
    render(
      <AppShell
        currentPath="/markets"
        user={{ id: "user_1", username: "mira", balance: 1000, showStartingBalance: true }}
      >
        <h1>Markets</h1>
      </AppShell>
    );

    expect(screen.getByText("You are starting with 1,000 points.")).toBeInTheDocument();
  });

  test("hides the starting balance banner after it has been dismissed for the user", async () => {
    render(
      <AppShell
        currentPath="/markets"
        user={{ id: "user_1", username: "mira", balance: 1000, showStartingBalance: true }}
      >
        <h1>Markets</h1>
      </AppShell>
    );

    await userEvent.click(screen.getByRole("button", { name: "Dismiss starting balance banner" }));

    expect(screen.queryByText("You are starting with 1,000 points.")).not.toBeInTheDocument();
  });

  test("renders a logout command", () => {
    render(
      <AppShell currentPath="/markets" user={{ id: "user_1", username: "mira", balance: 1000 }}>
        <h1>Markets</h1>
      </AppShell>
    );

    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });
});
