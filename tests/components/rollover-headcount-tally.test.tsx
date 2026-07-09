import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { RolloverHeadcountTally } from "@/components/days-parlay/rollover-headcount-tally";

describe("RolloverHeadcountTally", () => {
  test("renders a plain headcount tally with the strict-majority threshold and aria-live=polite", () => {
    render(<RolloverHeadcountTally tally={{ yesCount: 3, totalBackerCount: 5 }} />);

    const tallyText = screen.getByText("3 of 5 backers voted to roll over (needs 3 to pass)");
    expect(tallyText).toBeInTheDocument();
    expect(tallyText).toHaveAttribute("aria-live", "polite");
  });

  test("uses singular copy for a single backer", () => {
    render(<RolloverHeadcountTally tally={{ yesCount: 0, totalBackerCount: 1 }} />);

    expect(
      screen.getByText("0 of 1 backer voted to roll over (needs 1 to pass)")
    ).toBeInTheDocument();
  });

  test("computes the needed count for an even backer total", () => {
    render(<RolloverHeadcountTally tally={{ yesCount: 1, totalBackerCount: 4 }} />);

    expect(
      screen.getByText("1 of 4 backers voted to roll over (needs 3 to pass)")
    ).toBeInTheDocument();
  });
});
