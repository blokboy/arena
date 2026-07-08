"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { SellAllDialog } from "@/components/positions/sell-all-dialog";
import { SellFeedback, type SellFeedbackErrorCode } from "@/components/positions/sell-feedback";
import { groupKey, PositionGroupRow } from "@/components/positions/position-group-row";
import { calculateSellValue, groupPositions } from "@/domain/positions";
import { cn } from "@/lib/cn";
import { formatPoints } from "@/lib/money";

type PositionLotView = {
  id: string;
  marketId: string;
  marketQuestion: string;
  outcomeIndex: number;
  outcomeLabel: string;
  status: "OPEN" | "WON" | "LOST" | "VOIDED" | "SOLD";
  stake: string;
  shares: string;
  committedShares: string;
  entryPrice: string;
  purchasedAt: string;
  exitPrice?: string;
  exitedAt?: string;
  availableShares?: string;
  currentBestBid?: string | null;
  currentBestAsk?: string | null;
  currentSellValue?: string | null;
  marketActive?: boolean;
  marketClosed?: boolean;
  lastSyncedAt?: string;
};

type PositionGroupView = {
  marketId: string;
  marketQuestion: string;
  outcomeIndex: number;
  outcomeLabel: string;
  status: PositionLotView["status"];
  lots: PositionLotView[];
  totalStake: string;
  totalShares: string;
  committedShares: string;
  availableShares: string;
  averageEntryPrice: string;
  currentSellValue?: string;
  realizedPoints?: string;
  bestBid?: string | null;
  marketClosed?: boolean;
};

type ListedPositionLot = PositionLotView & {
  availableShares: string;
  currentBestBid: string | null;
  currentBestAsk: string | null;
  currentSellValue: string | null;
  marketActive: boolean;
  marketClosed: boolean;
  lastSyncedAt: string;
};

function computeSellValue(group: PositionGroupView): string | undefined {
  if (group.bestBid && group.availableShares !== "0") {
    try {
      return calculateSellValue({ shares: group.availableShares, bestBid: group.bestBid });
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function PortfolioClient() {
  const router = useRouter();
  const [positions, setPositions] = useState<ListedPositionLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [sellAllDialog, setSellAllDialog] = useState<{
    group: PositionGroupView;
    lotCount: number;
    availableShares: string;
    estimatedValue: string;
  } | null>(null);
  const [sellAllPending, setSellAllPending] = useState(false);
  const [sellAllError, setSellAllError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    state: "idle" | "success" | "error";
    soldShares?: string;
    creditedPoints?: string;
    errorCode?: string;
  }>({ state: "idle" });

  useEffect(() => {
    let active = true;

    fetch("/api/positions")
      .then(async (response) => {
        if (!response.ok) throw new Error("POSITIONS_REQUEST_FAILED");
        const body = (await response.json()) as { positions: ListedPositionLot[] };
        return body.positions;
      })
      .then((data) => {
        if (!active) return;
        setPositions(data);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setPositions([]);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // An OPEN lot must stay visible even when its market has no live bestBid
  // right now (PRICE_UNAVAILABLE / stale sync) — "no price to sell at" is a
  // disabled-sell-affordance state, not a reason for an open position to
  // disappear from the portfolio. groupWithSellValues already tolerates a
  // null bestBid per group (falls back to no currentSellValue).
  const rawOpenLots = positions.filter((lot) => lot.status === "OPEN");
  const rawSettledLots = positions.filter(
    (lot) => lot.status !== "OPEN"
  );

  const openLotData: PositionLotView[] = rawOpenLots.map((lot) => ({
    ...lot,
    currentSellValue: lot.currentSellValue,
    availableShares: lot.availableShares
  }));
  const settledLotData: PositionLotView[] = rawSettledLots.map((lot) => ({
    ...lot,
    currentSellValue: lot.currentSellValue,
    availableShares: lot.availableShares
  }));

  const openGroups: PositionGroupView[] = groupWithSellValues(
    groupPositions(openLotData),
    rawOpenLots
  );
  const settledGroups: PositionGroupView[] = groupPositions(settledLotData).map((g) => ({
    ...g,
    realizedPoints: computeRealizedPoints(g)
  }));

  function toggleExpanded(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const handleSellLot = useCallback(
    async (lotId: string) => {
      setFeedback({ state: "idle" });
      const response = await fetch(`/api/positions/${lotId}/sell`, { method: "POST" });
      const body = (await response.json()) as {
        position?: PositionLotView;
        proceeds?: string;
        balance?: number;
        error?: { code?: string };
      };

      if (!response.ok) {
        setFeedback({ state: "error", errorCode: body?.error?.code ?? "UNKNOWN" });
        return;
      }

      setFeedback({
        state: "success",
        soldShares: body.position?.shares,
        creditedPoints: body.proceeds
      });

      const updated = await fetch("/api/positions").then(
        (r) => r.json() as Promise<{ positions: ListedPositionLot[] }>
      );
      setPositions(updated.positions);
      router.refresh();
    },
    [router]
  );

  const handleSellAll = useCallback(
    async (groupId: string) => {
      if (!sellAllDialog) return;

      const response = await fetch("/api/positions/sell-all", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          marketId: sellAllDialog.group.marketId,
          outcomeIndex: sellAllDialog.group.outcomeIndex
        })
      });
      const body = (await response.json()) as {
        positions?: PositionLotView[];
        proceeds?: string;
        balance?: number;
        error?: { code?: string };
      };

      if (!response.ok) {
        setSellAllError(body?.error?.code ?? "Sell failed.");
        return;
      }

      setSellAllDialog(null);
      setFeedback({
        state: "success",
        soldShares: sellAllDialog.availableShares,
        creditedPoints: body.proceeds
      });

      const updated = await fetch("/api/positions").then(
        (r) => r.json() as Promise<{ positions: ListedPositionLot[] }>
      );
      setPositions(updated.positions);
      router.refresh();
    },
    [sellAllDialog, router]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <section>
          <h2 className="text-lg font-semibold text-slate-950">Open positions</h2>
          <div className="mt-3 space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-20 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
                Loading positions
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SellFeedback
        state={feedback.state}
        soldShares={feedback.soldShares}
        creditedPoints={feedback.creditedPoints}
        errorCode={feedback.errorCode as SellFeedbackErrorCode}
      />

      <section>
        <h2 className="text-lg font-semibold text-slate-950">Open positions</h2>
        {openGroups.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-600">
            <p>No open positions.</p>
            <Link href="/markets" className="mt-1 inline-block font-medium text-primary underline">
              Browse markets
            </Link>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {openGroups.map((group) => {
              const key = groupKey(group);
              const sellValue = computeSellValue(group);

              return (
                <PositionGroupRow
                  key={key}
                  group={{ ...group, currentSellValue: sellValue }}
                  expanded={expandedGroups.has(key)}
                  onToggleExpanded={toggleExpanded}
                  onSellAll={(gkey) => {
                    const g = openGroups.find((og) => groupKey(og) === gkey);
                    if (!g) return;
                    const lotsWithAvailable = g.lots.filter(
                      (lot) => Number(lot.shares) - Number(lot.committedShares) > 0
                    );
                    setSellAllDialog({
                      group: g,
                      lotCount: lotsWithAvailable.length,
                      availableShares: g.availableShares,
                      estimatedValue: sellValue ?? "0"
                    });
                  }}
                  onSellLot={handleSellLot}
                  canSellAll={true}
                  canSellLots={true}
                  sellAllDisabled={group.availableShares === "0"}
                />
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-950">Settled positions</h2>
        {settledGroups.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-600">
            No settled positions yet.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {settledGroups.map((group) => {
              const key = groupKey(group);
              return (
                <PositionGroupRow
                  key={key}
                  group={group}
                  expanded={expandedGroups.has(key)}
                  onToggleExpanded={toggleExpanded}
                  canSellAll={false}
                  canSellLots={false}
                  showRealizedResult={true}
                />
              );
            })}
          </div>
        )}
      </section>

      <SellAllDialog
        open={sellAllDialog !== null}
        lotCount={sellAllDialog?.lotCount ?? 0}
        availableShares={sellAllDialog?.availableShares ?? "0"}
        estimatedValue={sellAllDialog?.estimatedValue ?? "0"}
        onConfirm={async () => {
          setSellAllPending(true);
          setSellAllError(null);
          try {
            if (!sellAllDialog) return;
            const response = await fetch("/api/positions/sell-all", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                marketId: sellAllDialog.group.marketId,
                outcomeIndex: sellAllDialog.group.outcomeIndex
              })
            });
            const body = (await response.json()) as {
              positions?: PositionLotView[];
              proceeds?: string;
              balance?: number;
              error?: { code?: string };
            };

            if (!response.ok) {
              setSellAllError(body?.error?.code ?? "Sell failed.");
              return;
            }

            setSellAllDialog(null);
            setFeedback({
              state: "success",
              soldShares: sellAllDialog.availableShares,
              creditedPoints: body.proceeds
            });

            const updated = await fetch("/api/positions").then(
              (r) => r.json() as Promise<{ positions: ListedPositionLot[] }>
            );
            setPositions(updated.positions);
            router.refresh();
          } catch {
            setSellAllError("Sell failed.");
          } finally {
            setSellAllPending(false);
          }
        }}
        onCancel={() => {
          setSellAllDialog(null);
          setSellAllError(null);
        }}
        pending={sellAllPending}
        errorMessage={sellAllError}
      />
    </div>
  );
}

function groupWithSellValues(
  groups: PositionGroupView[],
  rawLots: ListedPositionLot[]
): PositionGroupView[] {
  const bestBidMap = new Map<string, string | null>();
  const marketClosedMap = new Map<string, boolean>();

  for (const lot of rawLots) {
    const key = `${lot.marketId}:${lot.outcomeIndex}`;
    if (!bestBidMap.has(key)) {
      bestBidMap.set(key, lot.currentBestBid);
    }
    if (!marketClosedMap.has(key)) {
      marketClosedMap.set(key, lot.marketClosed);
    }
  }

  return groups.map((g) => {
    const key = `${g.marketId}:${g.outcomeIndex}`;
    const bestBid = bestBidMap.get(key) ?? null;
    const marketClosed = marketClosedMap.get(key) ?? false;
    let currentSellValue: string | undefined;

    if (bestBid && g.availableShares !== "0") {
      try {
        currentSellValue = calculateSellValue({ shares: g.availableShares, bestBid });
      } catch {
        // bestBid may be stale or zero — leave undefined
      }
    }

    return { ...g, bestBid, marketClosed, currentSellValue };
  });
}

function computeRealizedPoints(group: PositionGroupView): string {
  const totalStake = Number(group.totalStake);
  const totalShares = Number(group.totalShares);

  if (group.status === "WON") {
    return String(totalShares - totalStake);
  }
  if (group.status === "LOST") {
    return String(-totalStake);
  }
  if (group.status === "VOIDED") {
    return "0";
  }
  if (group.status === "SOLD") {
    const exitPrices = group.lots
      .filter((lot) => lot.exitPrice)
      .map((lot) => Number(lot.exitPrice));
    if (exitPrices.length > 0) {
      const avgExit = exitPrices.reduce((a, b) => a + b, 0) / exitPrices.length;
      return String(totalShares * avgExit - totalStake);
    }
    return "0";
  }

  return "0";
}

export type { PositionLotView, PositionGroupView, ListedPositionLot };
