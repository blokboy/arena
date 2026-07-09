import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ActiveLegStickyMarker } from "@/components/parlays/active-leg-sticky-marker";
import type { LegTimelineLeg } from "@/components/parlays/leg-timeline";

const pendingLeg: LegTimelineLeg = {
  id: "leg-pending",
  status: "PENDING",
  endDate: "2028-11-09T00:00:00.000Z",
  marketQuestion: "Will the World Cup winner be Brazil?",
  outcomeLabel: "Yes",
  aggregateStakeAmount: "3.6",
  backerCount: 1
};

const activeLeg: LegTimelineLeg = {
  id: "leg-active",
  status: "ACTIVE",
  endDate: "2028-11-08T00:00:00.000Z",
  marketQuestion: "Will the Democrat win in 2028?",
  outcomeLabel: "Yes",
  aggregateStakeAmount: "67.2",
  backerCount: 2
};

describe("ActiveLegStickyMarker", () => {
  test("shows a you-are-here marker linking to the active leg's anchor", () => {
    render(<ActiveLegStickyMarker legs={[pendingLeg, activeLeg]} />);

    expect(screen.getByText(/you are here/i)).toBeInTheDocument();
    expect(screen.getByText(activeLeg.marketQuestion)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(activeLeg.marketQuestion) })).toHaveAttribute(
      "href",
      "#leg-leg-active"
    );
  });

  test("uses sticky positioning so it stays visible while scrolling the timeline", () => {
    render(<ActiveLegStickyMarker legs={[activeLeg]} />);

    expect(screen.getByTestId("active-leg-sticky-marker")).toHaveClass("sticky");
  });

  test("renders nothing when no leg in the chain is active", () => {
    render(<ActiveLegStickyMarker legs={[pendingLeg]} />);

    expect(screen.queryByTestId("active-leg-sticky-marker")).not.toBeInTheDocument();
  });
});
