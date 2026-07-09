import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { LegTimeline, type LegTimelineLeg } from "@/components/parlays/leg-timeline";

const laterLeg: LegTimelineLeg = {
  id: "leg-later",
  status: "PENDING",
  endDate: "2028-11-09T00:00:00.000Z",
  marketQuestion: "Will the World Cup winner be Brazil?",
  outcomeLabel: "Yes",
  aggregateStakeAmount: "3.6",
  backerCount: 1,
  bestBid: "0.34",
  bestAsk: "0.36",
  warning: null
};

const earlierLeg: LegTimelineLeg = {
  id: "leg-earlier",
  status: "ACTIVE",
  endDate: "2028-11-08T00:00:00.000Z",
  marketQuestion: "Will the Democrat win in 2028?",
  outcomeLabel: "Yes",
  aggregateStakeAmount: "67.2",
  backerCount: 2,
  bestBid: "0.62",
  bestAsk: "0.64",
  warning: "Parlay stakes are locked until the final leg resolves."
};

describe("LegTimeline", () => {
  test("renders rows in the exact array order passed in, never re-sorting client-side", () => {
    render(<LegTimeline legs={[laterLeg, earlierLeg]} />);

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText(laterLeg.marketQuestion)).toBeInTheDocument();
    expect(within(rows[1]!).getByText(earlierLeg.marketQuestion)).toBeInTheDocument();
  });

  test("each row exposes a stable anchor id of leg-{legId}", () => {
    const { container } = render(<LegTimeline legs={[earlierLeg, laterLeg]} />);

    expect(container.querySelector("#leg-leg-earlier")).toBeInTheDocument();
    expect(container.querySelector("#leg-leg-later")).toBeInTheDocument();
  });

  test("each row shows date, status badge, market question/outcome, backer summary, and prices", () => {
    render(<LegTimeline legs={[earlierLeg]} />);

    const row = screen.getByRole("listitem");
    expect(within(row).getByText(earlierLeg.marketQuestion)).toBeInTheDocument();
    expect(within(row).getByText(/Yes/)).toBeInTheDocument();
    expect(within(row).getByText("Live")).toBeInTheDocument();
    expect(within(row).getByText(/2 backers/)).toBeInTheDocument();
    expect(within(row).getByText(/67\.2/)).toBeInTheDocument();
    expect(within(row).getByText(/0\.62/)).toBeInTheDocument();
    expect(within(row).getByText(/0\.64/)).toBeInTheDocument();
  });

  test("renders an inline warning note on a row when provided", () => {
    render(<LegTimeline legs={[earlierLeg]} />);

    expect(
      screen.getByText("Parlay stakes are locked until the final leg resolves.")
    ).toBeInTheDocument();
  });

  test("renders nothing extra when a row has no warning", () => {
    render(<LegTimeline legs={[laterLeg]} />);

    expect(
      screen.queryByText("Parlay stakes are locked until the final leg resolves.")
    ).not.toBeInTheDocument();
  });
});
