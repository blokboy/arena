import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { EligiblePositionCommitSelector } from "@/components/parlays/eligible-position-commit-selector";
import { ParlayRosterStep } from "@/components/parlays/parlay-roster-step";
import type { EligiblePositionLot } from "@/components/parlays/types";

// Issue #8's create-parlay UI settled on a controlled-component architecture
// (parent owns state, these are dumb views): ParlayRosterStep + the
// "controlled" prop mode of EligiblePositionCommitSelector, composed by
// ParlayCreateFlow (src/components/parlays/parlay-create-flow.tsx, the
// component actually rendered by /parlays/new/page.tsx). Two earlier,
// unwired alternates — RosterStep + CreateParlayWizard, and the selector's
// "legacy" positions/onChange prop mode — are dead code and are
// intentionally not tested here. ParlayCreateFlow's own composition/submit
// sequencing is covered by tests/components/parlay-create-flow.test.tsx;
// this file covers the two reusable views it's built from.

describe("ParlayRosterStep", () => {
  test("shows the roster-lock notice", () => {
    render(<ParlayRosterStep name="" searchQuery="" selectedMembers={[]} searchResults={[]} />);

    expect(
      screen.getByText("Members can't be added later — only added members can append legs.")
    ).toBeInTheDocument();
  });

  test("reflects the controlled name value and reports changes via onNameChange", () => {
    const onNameChange = vi.fn();

    render(
      <ParlayRosterStep
        name="July ladder"
        searchQuery=""
        selectedMembers={[]}
        searchResults={[]}
        onNameChange={onNameChange}
      />
    );

    fireEvent.change(screen.getByDisplayValue("July ladder"), {
      target: { value: "July ladder!" }
    });

    expect(onNameChange).toHaveBeenCalledWith("July ladder!");
  });

  test("reports search query changes via onSearchQueryChange", () => {
    const onSearchQueryChange = vi.fn();

    render(
      <ParlayRosterStep
        name=""
        searchQuery=""
        selectedMembers={[]}
        searchResults={[]}
        onSearchQueryChange={onSearchQueryChange}
      />
    );

    // Controlled input: `searchQuery` never changes in this render, so
    // userEvent's keystroke-by-keystroke typing would fire onChange with
    // only the latest character each time. A single fireEvent.change with
    // the full value avoids that and matches how the real component's
    // parent (ParlayCreateFlow) actually threads state back down.
    fireEvent.change(screen.getByPlaceholderText("Search by username"), {
      target: { value: "bo" }
    });

    expect(onSearchQueryChange).toHaveBeenLastCalledWith("bo");
  });

  test("renders search results and adds a selection via onAddMember", async () => {
    const user = userEvent.setup();
    const onAddMember = vi.fn();

    render(
      <ParlayRosterStep
        name=""
        searchQuery="bo"
        selectedMembers={[]}
        searchResults={[{ id: "user_2", username: "bob" }]}
        onAddMember={onAddMember}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add bob" }));

    expect(onAddMember).toHaveBeenCalledWith({ id: "user_2", username: "bob" });
  });

  test("shows selected members as removable chips and reports removal by id", async () => {
    const user = userEvent.setup();
    const onRemoveMember = vi.fn();

    render(
      <ParlayRosterStep
        name=""
        searchQuery=""
        selectedMembers={[{ id: "user_2", username: "bob" }]}
        searchResults={[]}
        onRemoveMember={onRemoveMember}
      />
    );

    expect(screen.getByText("bob")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove bob" }));

    expect(onRemoveMember).toHaveBeenCalledWith("user_2");
  });

  test("marks an already-selected member as Added and disables re-adding them", () => {
    render(
      <ParlayRosterStep
        name=""
        searchQuery="bo"
        selectedMembers={[{ id: "user_2", username: "bob" }]}
        searchResults={[{ id: "user_2", username: "bob" }]}
      />
    );

    expect(screen.getByRole("button", { name: "Added bob" })).toBeDisabled();
  });

  test("shows nameError and rosterError as accessible alerts", () => {
    render(
      <ParlayRosterStep
        name=""
        searchQuery=""
        selectedMembers={[]}
        searchResults={[]}
        nameError="Enter a parlay name before continuing."
        rosterError="Users could not be loaded right now."
      />
    );

    const alerts = screen.getAllByRole("alert");
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      "Enter a parlay name before continuing.",
      "Users could not be loaded right now."
    ]);
  });

  test("disables inputs and roster actions while disabled", () => {
    render(
      <ParlayRosterStep
        name=""
        searchQuery=""
        selectedMembers={[{ id: "user_2", username: "bob" }]}
        searchResults={[{ id: "user_3", username: "chris" }]}
        onRemoveMember={() => {}}
        disabled
      />
    );

    expect(screen.getByPlaceholderText("Monday crew")).toBeDisabled();
    expect(screen.getByPlaceholderText("Search by username")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add chris" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove bob" })).toBeDisabled();
  });
});

describe("EligiblePositionCommitSelector (controlled)", () => {
  const lots: EligiblePositionLot[] = [
    {
      positionId: "lot-1",
      marketId: "market-1",
      marketQuestion: "Will a Democrat win the 2028 US presidential election?",
      outcomeIndex: 0,
      outcomeLabel: "Yes",
      entryPrice: "0.64",
      availableShares: "200"
    },
    {
      positionId: "lot-2",
      marketId: "market-1",
      marketQuestion: "Will a Democrat win the 2028 US presidential election?",
      outcomeIndex: 0,
      outcomeLabel: "Yes",
      entryPrice: "0.5",
      availableShares: "50"
    }
  ];

  test("shows the locked-share warning", () => {
    render(<EligiblePositionCommitSelector lots={lots} selectedCommitments={{}} />);

    expect(screen.getByText(/committed shares are locked immediately/i)).toBeInTheDocument();
    expect(screen.getByText(/lost to house/i)).toBeInTheDocument();
  });

  test("renders one row per eligible lot with its entry price and available shares", () => {
    render(<EligiblePositionCommitSelector lots={lots} selectedCommitments={{}} />);

    expect(screen.getByText("2 eligible lots")).toBeInTheDocument();
    expect(screen.getByText("0.64")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("0.5")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  test("reports a commitment change with the position id and typed value", () => {
    const onCommitmentChange = vi.fn();

    render(
      <EligiblePositionCommitSelector
        lots={lots}
        selectedCommitments={{}}
        onCommitmentChange={onCommitmentChange}
      />
    );

    fireEvent.change(screen.getByLabelText(/lot-1.*Yes.*0\.64/), {
      target: { value: "120" }
    });

    expect(onCommitmentChange).toHaveBeenCalledWith("lot-1", "120");
  });

  test("reflects the controlled selectedCommitments value in each input", () => {
    render(<EligiblePositionCommitSelector lots={lots} selectedCommitments={{ "lot-1": "120" }} />);

    expect(screen.getByLabelText(/lot-1.*Yes.*0\.64/)).toHaveValue(120);
  });

  test("shows an inline error when the controlled value exceeds available shares", () => {
    render(<EligiblePositionCommitSelector lots={lots} selectedCommitments={{ "lot-2": "51" }} />);

    expect(screen.getByText("Only 50 shares available.")).toBeInTheDocument();
  });

  test("shows no inline error when the committed value is exactly all available shares", () => {
    render(<EligiblePositionCommitSelector lots={lots} selectedCommitments={{ "lot-2": "50" }} />);

    expect(screen.queryByText(/shares available/)).not.toBeInTheDocument();
  });

  test("summarizes total selected shares and lot count", () => {
    render(
      <EligiblePositionCommitSelector
        lots={lots}
        selectedCommitments={{ "lot-1": "120", "lot-2": "50" }}
      />
    );

    const summary = screen.getByText(/Selected commitments:/);
    expect(within(summary.parentElement as HTMLElement).getByText("170")).toBeInTheDocument();
    expect(within(summary.parentElement as HTMLElement).getByText("2")).toBeInTheDocument();
  });

  test("shows a top-level errorMessage as an accessible alert", () => {
    render(
      <EligiblePositionCommitSelector
        lots={lots}
        selectedCommitments={{}}
        errorMessage="Commit at least one eligible lot to seed leg 1."
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Commit at least one eligible lot to seed leg 1."
    );
  });

  test("disables every commit input when disabled", () => {
    render(<EligiblePositionCommitSelector lots={lots} selectedCommitments={{}} disabled />);

    for (const input of screen.getAllByRole("spinbutton")) {
      expect(input).toBeDisabled();
    }
  });

  test("shows a neutral empty state instead of an empty table when there are no eligible lots", () => {
    render(<EligiblePositionCommitSelector lots={[]} selectedCommitments={{}} />);

    expect(screen.getByText("No eligible lots to commit.")).toBeInTheDocument();
  });
});
