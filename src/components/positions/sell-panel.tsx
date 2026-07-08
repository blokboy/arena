"use client";

import React, { useEffect, useState } from "react";

import { SellAllDialog } from "@/components/positions/sell-all-dialog";
import { SellFeedback, type SellFeedbackErrorCode } from "@/components/positions/sell-feedback";
import { SellPanelState } from "@/components/positions/sell-panel-state";
import { calculateSellValue, getAvailableShares, groupPositions } from "@/domain/positions";
import { cn } from "@/lib/cn";

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

type SellState =
  | { kind: "sellable" }
  | { kind: "no-position" }
  | { kind: "all-locked" }
  | { kind: "market-closed" }
  | { kind: "price-unavailable" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

type MarketSellPanelProps = {
  marketId: string;
  marketQuestion: string;
  outcomeIndex: number;
  outcomeLabel: string;
  bestBid: string | null;
  marketClosed: boolean;
  priceLastSyncedAt?: string;
  group: PositionGroupView | null;
  sellState: SellState;
  onSellLot: (lotId: string) => Promise<void>;
  onSellAll: (groupId: string) => Promise<void>;
  onOpenSellAllConfirm: () => void;
};

const STALE_THRESHOLD_MS = 90_000;
const STALE_RECHECK_INTERVAL_MS = 30_000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export { type MarketSellPanelProps, type PositionGroupView, type PositionLotView, type SellState };

export function MarketSellPanel({
  marketId,
  marketQuestion,
  outcomeIndex,
  outcomeLabel,
  bestBid,
  marketClosed,
  priceLastSyncedAt,
  group,
  sellState,
  onSellLot,
  onSellAll,
  onOpenSellAllConfirm
}: MarketSellPanelProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sellFeedbackState, setSellFeedbackState] = useState<"idle" | "success" | "error">("idle");
  const [sellFeedbackSoldShares, setSellFeedbackSoldShares] = useState<string | undefined>();
  const [sellFeedbackCredited, setSellFeedbackCredited] = useState<string | undefined>();
  const [sellFeedbackError, setSellFeedbackError] = useState<string | undefined>();
  const [sellAllDialogOpen, setSellAllDialogOpen] = useState(false);
  const [sellAllPending, setSellAllPending] = useState(false);
  const [sellAllError, setSellAllError] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), STALE_RECHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  if (sellState.kind === "loading") {
    return (
      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">Sell position</h2>
        <SellPanelState kind="loading" />
      </section>
    );
  }

  if (sellState.kind === "market-closed") {
    return (
      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">Sell position</h2>
        <SellPanelState kind="market-closed" />
      </section>
    );
  }

  if (sellState.kind === "no-position") {
    return (
      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">Sell position</h2>
        <SellPanelState kind="no-position" />
      </section>
    );
  }

  if (sellState.kind === "price-unavailable") {
    return (
      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">Sell position</h2>
        <SellPanelState kind="price-unavailable" />
        {priceLastSyncedAt ? (
          <p className="text-xs text-slate-500">
            {computeStalenessMessage(priceLastSyncedAt, nowMs)}
          </p>
        ) : null}
      </section>
    );
  }

  if (sellState.kind === "error") {
    return (
      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">Sell position</h2>
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {sellState.message}
        </p>
      </section>
    );
  }

  if (!group || group.status !== "OPEN") {
    if (group && group.status !== "OPEN") {
      return (
        <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-950">Sell position</h2>
          <SellPanelState kind="market-closed" />
        </section>
      );
    }
    return (
      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">Sell position</h2>
        <SellPanelState kind="no-position" />
      </section>
    );
  }

  const allAvailableShares = group.availableShares;
  const allLockedShares = group.committedShares;
  const hasAvailableShares = allAvailableShares !== "0";
  const hasLockedShares = allLockedShares !== "0";
  const stalenessMessage = priceLastSyncedAt
    ? computeStalenessMessage(priceLastSyncedAt, nowMs)
    : null;
  const currentSellValue =
    bestBid && hasAvailableShares
      ? calculateSellValue({ shares: allAvailableShares, bestBid })
      : null;

  if (!hasAvailableShares && hasLockedShares) {
    return (
      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">Sell position</h2>
        <div className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
          <p>No available shares to sell.</p>
          <p className="mt-1 text-xs text-slate-400">
            {allLockedShares} shares are locked into parlays.
          </p>
        </div>
      </section>
    );
  }

  if (!hasAvailableShares) {
    return (
      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">Sell position</h2>
        <SellPanelState kind="all-locked" lockedShares={allLockedShares} availableShares="0" />
      </section>
    );
  }

  const lotCount = group.lots.length;
  const openLotCount = group.lots.filter((lot) => getAvailableShares(lot) !== "0").length;

  return (
    <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-950">Sell position</h2>

      {bestBid !== null ? (
        <div>
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <p className="text-xs font-medium text-slate-700">Sell at</p>
            <p className="mt-0.5 text-2xl font-semibold text-slate-900">
              {bestBid}{" "}
              <span className="text-sm font-medium text-slate-700">
                points per share · {formatPercent(bestBid)}
              </span>
            </p>
          </div>
          {stalenessMessage ? (
            <p className="mt-1 text-xs text-slate-500">{stalenessMessage}</p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500">Available shares</span>
          <span className="font-medium text-slate-900">{allAvailableShares}</span>
        </div>
        {hasLockedShares ? (
          <div className="mt-1 flex items-center justify-between gap-4">
            <span className="text-slate-500">Locked in parlays</span>
            <span className="font-medium text-slate-400">{allLockedShares}</span>
          </div>
        ) : null}
        {currentSellValue !== null ? (
          <div className="mt-1 flex items-center justify-between gap-4">
            <span className="text-slate-500">Current value if sold now</span>
            <span className="font-medium text-slate-900">{currentSellValue}</span>
          </div>
        ) : null}
      </div>

      <SellFeedback
        state={sellFeedbackState}
        soldShares={sellFeedbackSoldShares}
        creditedPoints={sellFeedbackCredited}
        errorCode={sellFeedbackError as SellFeedbackErrorCode}
      />

      <div className="space-y-2">
        {group.lots.map((lot) => {
          const available = getAvailableShares(lot);
          if (available === "0") return null;

          return (
            <div
              key={lot.id}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2 text-sm"
            >
              <div>
                <p className="text-slate-600">
                  {lot.shares} shares at {lot.entryPrice}
                </p>
                <p className="text-xs text-slate-400">
                  {available} available · {formatDate(lot.purchasedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setSellFeedbackState("idle");
                  try {
                    await onSellLot(lot.id);
                    setSellFeedbackState("success");
                    setSellFeedbackSoldShares(available);
                    if (bestBid) {
                      setSellFeedbackCredited(calculateSellValue({ shares: available, bestBid }));
                    }
                  } catch {
                    setSellFeedbackState("error");
                    setSellFeedbackError("UNKNOWN");
                  }
                }}
                className="min-h-9 rounded-md border border-slate-200 px-3 py-1 text-sm font-medium text-slate-700 hover:border-slate-400"
              >
                Sell lot
              </button>
            </div>
          );
        })}
      </div>

      {lotCount > 0 ? (
        <button
          type="button"
          onClick={() => {
            setSellAllDialogOpen(true);
            onOpenSellAllConfirm();
          }}
          className={cn(
            "w-full min-h-11 rounded-md border px-4 py-2 text-sm font-medium",
            "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
          )}
        >
          Sell all available ({allAvailableShares} shares)
        </button>
      ) : null}

      <SellAllDialog
        open={sellAllDialogOpen}
        lotCount={openLotCount}
        availableShares={allAvailableShares}
        estimatedValue={currentSellValue ?? "0"}
        onConfirm={async () => {
          setSellAllPending(true);
          setSellAllError(null);
          try {
            await onSellAll(groupKey(group));
            setSellAllDialogOpen(false);
            setSellFeedbackState("success");
            setSellFeedbackSoldShares(allAvailableShares);
            setSellFeedbackCredited(currentSellValue ?? undefined);
          } catch (error) {
            setSellAllError(error instanceof Error ? error.message : "Sell failed.");
          } finally {
            setSellAllPending(false);
          }
        }}
        onCancel={() => {
          setSellAllDialogOpen(false);
          setSellAllError(null);
        }}
        pending={sellAllPending}
        errorMessage={sellAllError}
      />
    </section>
  );
}

function groupKey(group: { marketId: string; outcomeIndex: number; status: string }): string {
  return `${group.marketId}:${group.outcomeIndex}:${group.status}`;
}

function computeStalenessMessage(lastSyncedAt: string, nowMs: number): string | null {
  const ageMs = nowMs - new Date(lastSyncedAt).getTime();
  if (ageMs <= STALE_THRESHOLD_MS) return null;
  if (ageMs >= ONE_HOUR_MS)
    return "Prices synced over an hour ago — the live price may have moved.";
  const minutes = Math.max(1, Math.floor(ageMs / 60_000));
  return `Prices synced ${minutes}m ago — the live price may have moved.`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatPercent(value: string) {
  const [integerPart, fractionPart = ""] = value.split(".");
  const scaled = `${integerPart}${fractionPart.padEnd(2, "0").slice(0, 2)}`;
  const percent = scaled.replace(/^0+(?=\d)/, "") || "0";
  return `${percent}%`;
}
