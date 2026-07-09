import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { HouseBalanceStat } from "@/components/days-parlay/house-balance-stat";

describe("HouseBalanceStat", () => {
  test("renders the HOUSE balance and 50% bonus pool", () => {
    render(<HouseBalanceStat houseBalance="1000" />);

    expect(screen.getByText("HOUSE balance")).toBeInTheDocument();
    expect(screen.getByText("1,000.00")).toBeInTheDocument();
    expect(screen.getByText(/50%.*500\.00.*today's bonus pool/i)).toBeInTheDocument();
  });

  test("formats decimal balances correctly", () => {
    render(<HouseBalanceStat houseBalance="1234.56" />);

    expect(screen.getByText("1,234.56")).toBeInTheDocument();
    expect(screen.getByText(/617\.28/)).toBeInTheDocument();
  });

  test("handles zero balance", () => {
    render(<HouseBalanceStat houseBalance="0" />);

    expect(screen.getByText("0.00")).toBeInTheDocument();
    expect(screen.getByText(/0\.00.*today's bonus pool/i)).toBeInTheDocument();
  });
});
