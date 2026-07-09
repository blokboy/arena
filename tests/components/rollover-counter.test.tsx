import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { RolloverCounter } from "@/components/days-parlay/rollover-counter";

describe("RolloverCounter", () => {
  test("renders the rollover count out of 3", () => {
    render(<RolloverCounter rolloverCount={1} />);

    expect(screen.getByText("1 of 3 rollovers used today")).toBeInTheDocument();
  });

  test("renders zero rollovers used", () => {
    render(<RolloverCounter rolloverCount={0} />);

    expect(screen.getByText("0 of 3 rollovers used today")).toBeInTheDocument();
  });

  test("renders max rollovers used", () => {
    render(<RolloverCounter rolloverCount={3} />);

    expect(screen.getByText("3 of 3 rollovers used today")).toBeInTheDocument();
  });
});
