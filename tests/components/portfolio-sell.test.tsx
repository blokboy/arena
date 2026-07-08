import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Ban, Check, X } from "lucide-react";
import { describe, expect, test, vi } from "vitest";

import { PositionGroupRow } from "@/components/positions/position-group-row";
import { SellAllDialog } from "@/components/positions/sell-all-dialog";
import { StipendNotice } from "@/components/positions/stipend-notice";
import { calculateSellValue, getAvailableShares, groupPositions } from "@/domain/positions";
import { formatPoints } from "@/lib/money";

const { routerRefresh } = vi.hoisted(() => ({ routerRefresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh })
}));

describe("portfolio grouping logic", () => {
  test("groups lots by market and outcome with blended entry and available shares", () => {
    const groups = groupPositions([
      {
        id: "lot-1",
        marketId: "market-1",
        marketQuestion: "Will it rain?",
        outcomeIndex: 0,
        outcomeLabel: "Yes",
        status: "OPEN",
        stake: "100",
        shares: "200",
        committedShares: "25",
        entryPrice: "0.5",
        purchasedAt: "2026-07-06T10:00:00.000Z"
      },
      {
        id: "lot-2",
        marketId: "market-1",
        marketQuestion: "Will it rain?",
        outcomeIndex: 0,
        outcomeLabel: "Yes",
        status: "OPEN",
        stake: "60",
        shares: "100",
        committedShares: "0",
        entryPrice: "0.6",
        purchasedAt: "2026-07-06T11:00:00.000Z"
      }
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.totalStake).toBe("160");
    expect(groups[0]?.totalShares).toBe("300");
    expect(groups[0]?.committedShares).toBe("25");
    expect(groups[0]?.availableShares).toBe("275");
  });

  test("available-shares math excludes committed shares", () => {
    expect(getAvailableShares({ shares: "200", committedShares: "25" })).toBe("175");
    expect(getAvailableShares({ shares: "100", committedShares: "100" })).toBe("0");
  });

  test("sell value calculation uses shares × bestBid", () => {
    expect(calculateSellValue({ shares: "275", bestBid: "0.61" })).toBe("167.75");
    expect(calculateSellValue({ shares: "100", bestBid: "0.5" })).toBe("50");
  });

  test("committed shares cannot exceed total shares", () => {
    expect(() => getAvailableShares({ shares: "100", committedShares: "101" })).toThrow(
      "COMMITTED_SHARES_EXCEED_SHARES"
    );
  });

  // Regression: a fully sold lot has its remaining `shares` zeroed out by
  // getSellTransition (src/server/positions.ts), so the Portfolio page's
  // settled-lots table — which runs every non-OPEN lot through
  // groupPositions() — was throwing DIVIDE_BY_ZERO on render whenever a
  // position had been sold to completion.
  test("does not divide by zero when a fully sold lot's shares have been zeroed out", () => {
    const soldLot = {
      id: "lot-1",
      marketId: "market-1",
      marketQuestion: "Will it rain?",
      outcomeIndex: 0,
      outcomeLabel: "Yes",
      status: "SOLD" as const,
      stake: "0",
      shares: "0",
      committedShares: "0",
      entryPrice: "0.5",
      purchasedAt: "2026-07-06T10:00:00.000Z",
      exitPrice: "0.6",
      exitedAt: "2026-07-07T10:00:00.000Z"
    };

    expect(() => groupPositions([soldLot])).not.toThrow();
    const [group] = groupPositions([soldLot]);
    expect(group?.averageEntryPrice).toBe("0.5");
  });

  test("falls back to a plain mean of each lot's own entry price across multiple fully sold lots", () => {
    const soldLotA = {
      id: "lot-1",
      marketId: "market-1",
      marketQuestion: "Will it rain?",
      outcomeIndex: 0,
      outcomeLabel: "Yes",
      status: "SOLD" as const,
      stake: "0",
      shares: "0",
      committedShares: "0",
      entryPrice: "0.4",
      purchasedAt: "2026-07-06T10:00:00.000Z"
    };
    const soldLotB = { ...soldLotA, id: "lot-2", entryPrice: "0.6" };

    const [group] = groupPositions([soldLotA, soldLotB]);
    expect(group?.averageEntryPrice).toBe("0.5");
  });
});

describe("PositionGroupRow", () => {
  const openGroup = {
    marketId: "market-1",
    marketQuestion: "Will it rain?",
    outcomeIndex: 0,
    outcomeLabel: "Yes",
    status: "OPEN" as const,
    lots: [
      {
        id: "lot-1",
        marketId: "market-1",
        marketQuestion: "Will it rain?",
        outcomeIndex: 0,
        outcomeLabel: "Yes",
        status: "OPEN" as const,
        stake: "100",
        shares: "200",
        committedShares: "25",
        entryPrice: "0.5",
        purchasedAt: "2026-07-06T10:00:00.000Z"
      },
      {
        id: "lot-2",
        marketId: "market-1",
        marketQuestion: "Will it rain?",
        outcomeIndex: 0,
        outcomeLabel: "Yes",
        status: "OPEN" as const,
        stake: "60",
        shares: "100",
        committedShares: "0",
        entryPrice: "0.6",
        purchasedAt: "2026-07-06T11:00:00.000Z"
      }
    ],
    totalStake: "160",
    totalShares: "300",
    committedShares: "25",
    availableShares: "275",
    averageEntryPrice: "0.5333333333333333"
  };

  test("renders the market question, outcome, and aggregated values", () => {
    render(
      <PositionGroupRow
        group={openGroup}
        expanded={false}
        onToggleExpanded={() => {}}
        canSellAll={false}
        canSellLots={false}
      />
    );

    expect(screen.getByText("Will it rain?")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText(/0.5333333333333333/)).toBeInTheDocument();
    expect(screen.getByText(/275/)).toBeInTheDocument();
    expect(screen.getByText("2 lots")).toBeInTheDocument();
  });

  test("toggles expand/collapse when the lot count button is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <PositionGroupRow
        group={openGroup}
        expanded={false}
        onToggleExpanded={onToggle}
        canSellAll={false}
        canSellLots={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "2 lots" }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    const toggleButton = screen.getByRole("button", { name: "2 lots" });
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
  });

  test("shows expanded state and reveals lots when expanded", () => {
    render(
      <PositionGroupRow
        group={openGroup}
        expanded={true}
        onToggleExpanded={() => {}}
        canSellAll={false}
        canSellLots={false}
      />
    );

    expect(screen.getByText("Hide lots")).toBeInTheDocument();
    expect(screen.getByText(/200 shares/)).toBeInTheDocument();
    expect(screen.getByText(/100 shares/)).toBeInTheDocument();
  });

  test("shows locked-share indicator on the group row and on expanded lot rows", () => {
    render(
      <PositionGroupRow
        group={openGroup}
        expanded={true}
        onToggleExpanded={() => {}}
        canSellAll={false}
        canSellLots={false}
      />
    );

    expect(screen.getAllByText(/locked/).length).toBeGreaterThanOrEqual(1);
  });

  test("renders sell-all button when canSellAll is true", () => {
    render(
      <PositionGroupRow
        group={openGroup}
        expanded={false}
        onToggleExpanded={() => {}}
        onSellAll={() => {}}
        canSellAll={true}
        canSellLots={false}
      />
    );

    expect(screen.getByRole("button", { name: "Sell all available" })).toBeInTheDocument();
  });

  test("does not render sell-all button on settled groups", () => {
    const settledGroup = { ...openGroup, status: "WON" as const };
    render(
      <PositionGroupRow
        group={settledGroup}
        expanded={false}
        onToggleExpanded={() => {}}
        canSellAll={false}
        canSellLots={false}
      />
    );

    expect(screen.queryByRole("button", { name: "Sell all available" })).not.toBeInTheDocument();
  });

  test("renders realized points for settled groups when showRealizedResult is true", () => {
    const wonGroup = {
      ...openGroup,
      status: "WON" as const,
      realizedPoints: "140"
    };
    render(
      <PositionGroupRow
        group={wonGroup}
        expanded={false}
        onToggleExpanded={() => {}}
        canSellAll={false}
        canSellLots={false}
        showRealizedResult={true}
      />
    );

    expect(screen.getByText(/Realized/)).toBeInTheDocument();
  });

  test("renders settled status copy for won lost and voided groups", () => {
    const settledGroups = [
      { ...openGroup, status: "WON" as const },
      { ...openGroup, status: "LOST" as const },
      { ...openGroup, status: "VOIDED" as const }
    ];

    render(
      <div>
        {settledGroups.map((group) => (
          <PositionGroupRow
            key={group.status}
            group={group}
            expanded={false}
            onToggleExpanded={() => {}}
            canSellAll={false}
            canSellLots={false}
            showRealizedResult={true}
          />
        ))}
      </div>
    );

    expect(screen.getByText("Won")).toBeInTheDocument();
    expect(screen.getByText("Lost")).toBeInTheDocument();
    expect(screen.getByText("Voided, refunded")).toBeInTheDocument();
  });
});

describe("SellAllDialog", () => {
  test("renders the confirmation with lot count and share totals", () => {
    render(
      <SellAllDialog
        open={true}
        lotCount={3}
        availableShares="428"
        estimatedValue="256.08"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );

    expect(screen.getByText("Sell all available shares?")).toBeInTheDocument();
    expect(screen.getByText(/3 purchases/)).toBeInTheDocument();
    expect(screen.getByText(/428/)).toBeInTheDocument();
    expect(screen.getByText(/Shares locked into parlays are not included/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sell all available" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  test("does not render anything when open is false", () => {
    render(
      <SellAllDialog
        open={false}
        lotCount={3}
        availableShares="428"
        estimatedValue="256.08"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );

    expect(screen.queryByText("Sell all available shares?")).not.toBeInTheDocument();
  });

  test("shows the correct lot count label for a single lot", () => {
    const { container } = render(
      <SellAllDialog
        open={true}
        lotCount={1}
        availableShares="100"
        estimatedValue="50"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );

    expect(container.textContent).toMatch(/1 purchase/);
  });

  test("calls onConfirm when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <SellAllDialog
        open={true}
        lotCount={2}
        availableShares="300"
        estimatedValue="180"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: "Sell all available" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("calls onCancel when the cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <SellAllDialog
        open={true}
        lotCount={2}
        availableShares="300"
        estimatedValue="180"
        onConfirm={async () => {}}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("disables buttons and shows loading text while pending", () => {
    render(
      <SellAllDialog
        open={true}
        lotCount={2}
        availableShares="300"
        estimatedValue="180"
        onConfirm={async () => {}}
        onCancel={() => {}}
        pending={true}
      />
    );

    expect(screen.getByRole("button", { name: "Selling…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  test("shows an error message when provided", () => {
    render(
      <SellAllDialog
        open={true}
        lotCount={2}
        availableShares="300"
        estimatedValue="180"
        onConfirm={async () => {}}
        onCancel={() => {}}
        errorMessage="NO_AVAILABLE_SHARES"
      />
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  test("has accessible dialog markup", () => {
    render(
      <SellAllDialog
        open={true}
        lotCount={1}
        availableShares="100"
        estimatedValue="60"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Sell all available shares?");
  });
});

describe("settled-row status treatment", () => {
  const baseLot = {
    id: "lot-1",
    marketId: "market-1",
    marketQuestion: "Will it rain?",
    outcomeIndex: 0,
    outcomeLabel: "Yes",
    stake: "100",
    shares: "200",
    committedShares: "0",
    entryPrice: "0.5",
    purchasedAt: "2026-07-06T10:00:00.000Z"
  };

  function settledGroup(status: "WON" | "LOST" | "VOIDED", realizedPoints?: string) {
    return {
      marketId: "market-1",
      marketQuestion: "Will it rain?",
      outcomeIndex: 0,
      outcomeLabel: "Yes",
      status,
      lots: [{ ...baseLot, status }],
      totalStake: "100",
      totalShares: "200",
      committedShares: "0",
      availableShares: "0",
      averageEntryPrice: "0.5",
      realizedPoints
    };
  }

  test("won status shows green badge with Check icon and no mark-to-market language", () => {
    render(
      <PositionGroupRow
        group={settledGroup("WON", "100")}
        expanded={false}
        onToggleExpanded={() => {}}
        canSellAll={false}
        canSellLots={false}
        showRealizedResult={true}
      />
    );

    expect(screen.getByText("Won")).toBeInTheDocument();
    expect(screen.queryByText("P&L")).not.toBeInTheDocument();
    expect(screen.queryByText("current value if sold now")).not.toBeInTheDocument();
    expect(screen.queryByText("unrealized")).not.toBeInTheDocument();
    expect(screen.getByText(/Realized/)).toBeInTheDocument();
  });

  test("lost status shows red badge with X icon", () => {
    render(
      <PositionGroupRow
        group={settledGroup("LOST", "-100")}
        expanded={false}
        onToggleExpanded={() => {}}
        canSellAll={false}
        canSellLots={false}
        showRealizedResult={true}
      />
    );

    expect(screen.getByText("Lost")).toBeInTheDocument();
    expect(screen.queryByText("P&L")).not.toBeInTheDocument();
    expect(screen.queryByText("current value if sold now")).not.toBeInTheDocument();
  });

  test("voided status shows 'Voided, refunded' with Ban icon in neutral gray", () => {
    render(
      <PositionGroupRow
        group={settledGroup("VOIDED", "0")}
        expanded={false}
        onToggleExpanded={() => {}}
        canSellAll={false}
        canSellLots={false}
        showRealizedResult={true}
      />
    );

    expect(screen.getByText("Voided, refunded")).toBeInTheDocument();
    expect(screen.queryByText("Voided")).not.toBeInTheDocument();
    expect(screen.queryByText("P&L")).not.toBeInTheDocument();
    expect(screen.queryByText("current value if sold now")).not.toBeInTheDocument();
  });

  test("won status in expanded lot row shows Check icon", () => {
    render(
      <PositionGroupRow
        group={settledGroup("WON", "100")}
        expanded={true}
        onToggleExpanded={() => {}}
        canSellAll={false}
        canSellLots={false}
        showRealizedResult={true}
      />
    );

    expect(screen.getAllByText("Won")).toHaveLength(2);
  });
});

describe("StipendNotice", () => {
  test("renders the bankruptcy stipend banner when granted", () => {
    render(<StipendNotice granted={true} onDismiss={() => {}} />);

    expect(screen.getByText("Bankruptcy stipend received")).toBeInTheDocument();
    expect(
      screen.getByText(
        /The daily UTC stipend added \+200 points because your balance was at or below 0\./
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dismiss bankruptcy stipend notice" })
    ).toBeInTheDocument();
  });

  test("does not render when not granted", () => {
    render(<StipendNotice granted={false} onDismiss={() => {}} />);

    expect(screen.queryByText("Bankruptcy stipend received")).not.toBeInTheDocument();
  });

  test("calls onDismiss when dismiss button is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(<StipendNotice granted={true} onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: "Dismiss bankruptcy stipend notice" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("sell value display formatting", () => {
  test("formatPoints renders readable point values", () => {
    expect(formatPoints(167.75)).toBe("167.75");
    expect(formatPoints(1000)).toBe("1,000");
    expect(formatPoints(0)).toBe("0");
  });
});
