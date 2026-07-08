import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { CreateParlayWizard } from "@/components/parlays/create-parlay-wizard";
import { EligiblePositionCommitSelector } from "@/components/parlays/eligible-position-commit-selector";
import { ParlayCommitConfirmDialog } from "@/components/parlays/parlay-commit-confirm-dialog";
import { ParlayRosterStep } from "@/components/parlays/parlay-roster-step";
import { RosterLockNotice } from "@/components/parlays/roster-lock-notice";
import { WizardStepIndicator } from "@/components/parlays/wizard-step-indicator";

describe("WizardStepIndicator", () => {
  test("presents the roster -> first-leg sequence with the active step marked", () => {
    render(<WizardStepIndicator currentStep="roster" />);

    expect(screen.getByRole("list", { name: "Parlay creation steps" })).toBeInTheDocument();
    expect(screen.getByText("Roster")).toBeInTheDocument();
    expect(screen.getByText("First leg")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Roster");
  });
});

describe("RosterLockNotice", () => {
  test("keeps the irreversible roster copy prominent", () => {
    render(<RosterLockNotice />);

    expect(screen.getByText("Members can't be added later.")).toBeInTheDocument();
    expect(screen.getByText(/one-time, consequential choice/i)).toBeInTheDocument();
  });
});

describe("ParlayRosterStep", () => {
  test("shows the roster lock warning above the member picker", () => {
    render(
      <ParlayRosterStep
        name="Monday crew"
        searchQuery=""
        selectedMembers={[{ id: "user-1", username: "casey" }]}
        searchResults={[{ id: "user-2", username: "alex" }]}
      />
    );

    expect(screen.getByText("Members can't be added later.")).toBeInTheDocument();
    expect(screen.getByText("Locked roster")).toBeInTheDocument();
    expect(screen.getByText("casey")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add alex/i })).toBeInTheDocument();
  });

  test("renders a searchable picker with stable usernames and an add action", async () => {
    const user = userEvent.setup();
    const onAddMember = vi.fn();

    render(
      <ParlayRosterStep
        name="Monday crew"
        searchQuery="al"
        selectedMembers={[]}
        searchResults={[{ id: "user-2", username: "alex", subtitle: "active" }]}
        onAddMember={onAddMember}
      />
    );

    await user.click(screen.getByRole("button", { name: /add alex/i }));
    expect(onAddMember).toHaveBeenCalledWith({ id: "user-2", username: "alex", subtitle: "active" });
    expect(screen.getByLabelText("Parlay name")).toHaveValue("Monday crew");
    expect(screen.getByPlaceholderText("Search by username")).toHaveValue("al");
  });
});

describe("EligiblePositionCommitSelector", () => {
  const lots = [
    {
      positionId: "pos-1",
      marketId: "m-1",
      marketQuestion: "Will BTC close above 150k?",
      outcomeIndex: 0,
      outcomeLabel: "Yes",
      entryPrice: "0.56",
      availableShares: "120",
      committedShares: "0",
      purchasedAt: "2026-07-06T10:00:00.000Z"
    },
    {
      positionId: "pos-2",
      marketId: "m-2",
      marketQuestion: "Will rain hit Chicago?",
      outcomeIndex: 1,
      outcomeLabel: "No",
      entryPrice: "0.41",
      availableShares: "30",
      committedShares: "0",
      purchasedAt: "2026-07-06T11:00:00.000Z"
    }
  ] as const;

  test("shows lot-level entry price, available shares, and the lock warning", () => {
    render(<EligiblePositionCommitSelector lots={lots} selectedCommitments={{}} />);

    expect(screen.getByText(/these shares become unavailable after commit/i)).toBeInTheDocument();
    expect(screen.getByText("Will BTC close above 150k?")).toBeInTheDocument();
    expect(screen.getByText("0.56")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByLabelText(/shares to commit for will btc close above 150k\? yes/i)).toHaveValue(
      null
    );
  });

  test("highlights selected lots as locked after commit", () => {
    render(
      <EligiblePositionCommitSelector
        lots={lots}
        selectedCommitments={{ "pos-1": "25" }}
      />
    );

    expect(screen.getByText("25 selected")).toBeInTheDocument();
  });
});

describe("ParlayCommitConfirmDialog", () => {
  test("states that shares lock immediately and can be lost to HOUSE", async () => {
    render(
      <ParlayCommitConfirmDialog
        open={true}
        title="Commit shares?"
        commitmentSummary="You are about to commit 50 shares."
        lockedWarning="Committed shares are locked immediately and cannot be reused."
        houseRiskCopy="If an earlier leg fails before this one is reached, the commitment is lost to HOUSE."
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );

    expect(screen.getByRole("dialog", { name: "Commit shares?" })).toBeInTheDocument();
    expect(screen.getByText("Locked immediately")).toBeInTheDocument();
    expect(screen.getByText(/lost to HOUSE/i)).toBeInTheDocument();
  });

  test("traps focus and returns it to the trigger on close", async () => {
    const user = userEvent.setup();
    const trigger = vi.fn();

    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button" onClick={trigger}>
            Open dialog
          </button>
          <ParlayCommitConfirmDialog
            open={open}
            title="Commit shares?"
            commitmentSummary="You are about to commit 50 shares."
            lockedWarning="Committed shares are locked immediately."
            houseRiskCopy="If an earlier leg fails first, the commitment is lost to HOUSE."
            onConfirm={async () => {}}
            onCancel={() => {}}
          />
        </>
      );
    }

    const { rerender } = render(<Harness open={false} />);
    const button = screen.getByRole("button", { name: "Open dialog" });
    button.focus();

    rerender(<Harness open={true} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Commit shares" })).toHaveFocus();

    rerender(<Harness open={false} />);
    expect(button).toHaveFocus();
  });
});

describe("CreateParlayWizard", () => {
  test("keeps the two-step flow visible and changes the primary action by step", () => {
    render(
      <CreateParlayWizard
        step="roster"
        name="Monday crew"
        searchQuery=""
        selectedMembers={[]}
        searchResults={[]}
        lots={[]}
        selectedCommitments={{}}
      />
    );

    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to first leg" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create parlay" })).not.toBeInTheDocument();
  });
});
