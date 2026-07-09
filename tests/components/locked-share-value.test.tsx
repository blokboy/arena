import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { LockedShareValue } from "@/components/positions/locked-share-value";

describe("LockedShareValue", () => {
  test("renders nothing when there are no locked shares", () => {
    const { container } = render(<LockedShareValue lockedShares="0" availableShares="100" />);
    expect(container).toBeEmptyDOMElement();
  });

  test("shows the pending-lock copy when the commitment is still unresolved", () => {
    render(<LockedShareValue lockedShares="25" availableShares="175" />);

    expect(screen.getByText(/25 locked/)).toBeInTheDocument();
    expect(screen.getByText(/not sellable/)).toBeInTheDocument();
    expect(screen.queryByText(/resolved via parlay/i)).not.toBeInTheDocument();
  });

  // PRD: committed shares settle only through the parlay leg, never show as
  // available in the portfolio panel once the chain resolves. Once
  // Position.committedSettled flips true, the copy must stop implying the
  // shares are still "at risk, pending" — they're gone, resolved elsewhere.
  test("shows distinct resolved-via-parlay copy once the commitment has settled", () => {
    render(<LockedShareValue lockedShares="25" availableShares="175" committedSettled />);

    expect(screen.getByText(/25 locked/)).toBeInTheDocument();
    expect(screen.getByText(/resolved via parlay/i)).toBeInTheDocument();
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument();
    expect(screen.queryByText(/not sellable/)).not.toBeInTheDocument();
  });
});
