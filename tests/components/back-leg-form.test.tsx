import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { BackLegForm } from "@/components/parlays/back-leg-form";

const eligibleLot = {
  positionId: "position-1",
  marketQuestion: "Will the Democrat win in 2028?",
  outcomeLabel: "Yes",
  availableShares: "50"
};

describe("BackLegForm", () => {
  test("always shows the locked-share / HOUSE-loss warning before submit", () => {
    render(<BackLegForm eligibleLot={eligibleLot} isMember={false} onSubmit={vi.fn()} error={null} />);

    expect(
      screen.getByText(
        /these shares will be locked into this parlay\. if an earlier leg fails before this leg is reached, this commitment is lost to house/i
      )
    ).toBeInTheDocument();
  });

  test("submits the chosen share amount for the eligible lot", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<BackLegForm eligibleLot={eligibleLot} isMember={false} onSubmit={onSubmit} error={null} />);

    await user.clear(screen.getByLabelText(/shares to commit/i));
    await user.type(screen.getByLabelText(/shares to commit/i), "5");
    await user.click(screen.getByRole("button", { name: /back this leg/i }));

    expect(onSubmit).toHaveBeenCalledWith({ positionId: "position-1", shares: "5" });
  });

  test("tells non-members that backing does not grant rollover-voting rights", () => {
    render(<BackLegForm eligibleLot={eligibleLot} isMember={false} onSubmit={vi.fn()} error={null} />);

    expect(screen.getByText(/does not grant rollover-voting rights/i)).toBeInTheDocument();
  });

  test("does not show the no-vote-rights note for formal members, who already have voting rights", () => {
    render(<BackLegForm eligibleLot={eligibleLot} isMember onSubmit={vi.fn()} error={null} />);

    expect(screen.queryByText(/does not grant rollover-voting rights/i)).not.toBeInTheDocument();
  });

  test("renders a backing failure inline at the point of entry, not only as a toast", () => {
    render(
      <BackLegForm
        eligibleLot={eligibleLot}
        isMember={false}
        onSubmit={vi.fn()}
        error={{ code: "LEG_NOT_ACTIVE", message: "Only the active leg can be backed." }}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Only the active leg can be backed.");
  });
});
