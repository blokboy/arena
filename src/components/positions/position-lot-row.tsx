"use client";

import React from "react";
import { Ban, Check, X } from "lucide-react";

import { LockedShareValue } from "@/components/positions/locked-share-value";
import { getAvailableShares } from "@/domain/positions";
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

type PositionLotRowProps = {
  lot: PositionLotView;
  showSellAction: boolean;
  onSell: (lotId: string) => void;
  sellLabel?: string;
  sellDisabled?: boolean;
};

export function PositionLotRow({
  lot,
  showSellAction,
  onSell,
  sellLabel,
  sellDisabled
}: PositionLotRowProps) {
  const availableShares = getAvailableShares(lot);
  const hasAvailable = availableShares !== "0";

  return (
    <div className="grid gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0 lg:grid-cols-[1fr_auto_auto] lg:items-center">
      <div className="text-sm text-slate-600">
        <span className="font-medium text-slate-900">{formatDate(lot.purchasedAt)}</span>
        <span className="mx-1">·</span>
        <span>Entry {lot.entryPrice}</span>
        <span className="mx-1">·</span>
        <span>{lot.shares} shares</span>
        {lot.committedShares !== "0" ? (
          <>
            <span className="mx-1">·</span>
            <LockedShareValue
              availableShares={availableShares}
              lockedShares={lot.committedShares}
            />
          </>
        ) : null}
        <span className="mx-1">·</span>
        <span>{availableShares} available</span>
        {lot.exitPrice ? (
          <>
            <span className="mx-1">·</span>
            <span className="text-slate-400">Exited at {lot.exitPrice}</span>
          </>
        ) : null}
        {lot.exitedAt ? (
          <>
            <span className="mx-1">·</span>
            <span className="text-slate-400">{formatDate(lot.exitedAt)}</span>
          </>
        ) : null}
        {lot.status !== "OPEN" ? (
          <>
            <span className="mx-1">·</span>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                lot.status === "WON" && "text-emerald-600",
                lot.status === "LOST" && "text-red-600",
                lot.status === "VOIDED" && "text-slate-500",
                lot.status === "SOLD" && "text-slate-500"
              )}
            >
              {lot.status === "WON" ? (
                <>
                  <Check className="h-3 w-3" aria-hidden="true" /> Won
                </>
              ) : lot.status === "LOST" ? (
                <>
                  <X className="h-3 w-3" aria-hidden="true" /> Lost
                </>
              ) : lot.status === "VOIDED" ? (
                <>
                  <Ban className="h-3 w-3" aria-hidden="true" /> Voided, refunded
                </>
              ) : (
                "Sold"
              )}
            </span>
          </>
        ) : null}
      </div>

      {showSellAction && hasAvailable && !sellDisabled ? (
        <button
          type="button"
          onClick={() => onSell(lot.id)}
          className="min-h-9 rounded-md border border-slate-200 px-3 py-1 text-sm font-medium text-slate-700 hover:border-slate-400"
        >
          {sellLabel ?? "Sell lot"}
        </button>
      ) : null}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
