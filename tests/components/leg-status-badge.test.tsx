import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { LegStatusBadge, type LegStatus } from "@/components/parlays/leg-status-badge";

const STATUS_EXPECTATIONS: Array<{ status: LegStatus; label: string; iconTestId: string }> = [
  { status: "PENDING", label: "Pending, locked", iconTestId: "leg-status-icon-pending" },
  { status: "ACTIVE", label: "Live", iconTestId: "leg-status-icon-active" },
  { status: "RESOLVED_WON", label: "Won", iconTestId: "leg-status-icon-won" },
  { status: "RESOLVED_LOST", label: "Lost", iconTestId: "leg-status-icon-lost" },
  { status: "ROLLED_OVER", label: "Rolled over", iconTestId: "leg-status-icon-rolled-over" },
  { status: "VOIDED", label: "Voided, refunded", iconTestId: "leg-status-icon-voided" }
];

describe("LegStatusBadge", () => {
  test.each(STATUS_EXPECTATIONS)(
    "renders the $status label paired with a distinct icon, not color alone",
    ({ status, label, iconTestId }) => {
      render(<LegStatusBadge status={status} />);

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByTestId(iconTestId)).toBeInTheDocument();
    }
  );

  test("every status renders a visually distinct icon from every other status", () => {
    const renderedIconIds = STATUS_EXPECTATIONS.map(({ status, iconTestId }) => {
      const { unmount } = render(<LegStatusBadge status={status} />);
      const icon = screen.getByTestId(iconTestId);
      unmount();
      return icon.getAttribute("data-lucide-icon");
    });

    expect(new Set(renderedIconIds).size).toBe(renderedIconIds.length);
  });

  test("PENDING renders an outline/dashed shape, distinguishing it from solid badges by shape not just color", () => {
    render(<LegStatusBadge status="PENDING" />);

    expect(screen.getByRole("status")).toHaveClass("border-dashed");
  });

  test("ACTIVE is the only status with a pulsing live indicator by default", () => {
    render(<LegStatusBadge status="ACTIVE" />);

    expect(screen.getByTestId("leg-status-live-dot")).toHaveClass("animate-pulse");
  });

  test("ACTIVE respects prefers-reduced-motion by keeping a distinct static indicator instead of removing the cue", () => {
    render(<LegStatusBadge status="ACTIVE" reducedMotion />);

    const dot = screen.getByTestId("leg-status-live-dot");
    expect(dot).not.toHaveClass("animate-pulse");
    expect(dot).toHaveClass("ring-2");
  });

  test("non-ACTIVE statuses never render the live pulsing dot", () => {
    render(<LegStatusBadge status="RESOLVED_WON" />);

    expect(screen.queryByTestId("leg-status-live-dot")).not.toBeInTheDocument();
  });
});
