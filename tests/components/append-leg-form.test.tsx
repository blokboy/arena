import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { AppendLegForm } from "@/components/parlays/append-leg-form";

const eligibleLot = {
  positionId: "position-1",
  marketQuestion: "Will the World Cup winner be Brazil?",
  outcomeLabel: "Yes",
  availableShares: "50"
};

describe("AppendLegForm", () => {
  test("always shows the locked-share / HOUSE-loss warning before submit", () => {
    render(<AppendLegForm eligibleLot={eligibleLot} onSubmit={vi.fn()} error={null} />);

    expect(
      screen.getByText(
        /these shares will be locked into this parlay\. if an earlier leg fails before this leg is reached, this commitment is lost to house/i
      )
    ).toBeInTheDocument();
  });

  test("submits the chosen share amount for the eligible lot", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AppendLegForm eligibleLot={eligibleLot} onSubmit={onSubmit} error={null} />);

    await user.clear(screen.getByLabelText(/shares to commit/i));
    await user.type(screen.getByLabelText(/shares to commit/i), "10");
    await user.click(screen.getByRole("button", { name: /append leg/i }));

    expect(onSubmit).toHaveBeenCalledWith({ positionId: "position-1", shares: "10" });
  });

  test("disables submit when the requested shares exceed available shares", async () => {
    const user = userEvent.setup();
    render(<AppendLegForm eligibleLot={eligibleLot} onSubmit={vi.fn()} error={null} />);

    await user.clear(screen.getByLabelText(/shares to commit/i));
    await user.type(screen.getByLabelText(/shares to commit/i), "500");

    expect(screen.getByRole("button", { name: /append leg/i })).toBeDisabled();
  });

  test("renders LEG_APPEND_TOO_EARLY as an inline message at the point of entry, citing the conflicting date", () => {
    render(
      <AppendLegForm
        eligibleLot={eligibleLot}
        onSubmit={vi.fn()}
        error={{
          code: "LEG_APPEND_TOO_EARLY",
          details: {
            activeLegEndDate: "2028-11-08T00:00:00.000Z",
            attemptedMarketEndDate: "2028-11-07T00:00:00.000Z"
          }
        }}
      />
    );

    const message = screen.getByRole("alert");
    expect(message).toHaveTextContent(/resolves before the current active leg/i);
    expect(message).toHaveTextContent(/Nov 8/);
  });
});
