"use client";

import React from "react";
import { Ban, Check, X } from "lucide-react";

import { LockedShareValue } from "@/components/positions/locked-share-value";
import { PositionLotRow } from "@/components/positions/position-lot-row";
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

type PositionGroupRowProps = {
  group: PositionGroupView;
  expanded: boolean;
  onToggleExpanded: (groupId: string) => void;
  onSellAll?: (groupId: string) => void;
  onSellLot?: (lotId: string) => void;
  canSellAll: boolean;
  canSellLots: boolean;
  showRealizedResult?: boolean;
  sellAllDisabled?: boolean;
  sellLotDisabled?: boolean;
};

function groupKey(group: PositionGroupView): string {
  return `${group.marketId}:${group.outcomeIndex}:${group.status}`;
}

export { groupKey };

export type { PositionGroupView, PositionLotView };

export function PositionGroupRow({
  group,
  expanded,
  onToggleExpanded,
  onSellAll,
  onSellLot,
  canSellAll,
  canSellLots,
  showRealizedResult,
  sellAllDisabled,
  sellLotDisabled
}: PositionGroupRowProps) {
  const key = groupKey(group);
  const detailsId = `group-${key}-details`;
  const showSellValue =
    group.currentSellValue && group.availableShares !== "0" && !showRealizedResult;

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-slate-950">{group.marketQuestion}</h3>
            <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {group.outcomeLabel}
            </span>
            {group.status !== "OPEN" ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium",
                  group.status === "WON" && "bg-emerald-100 text-emerald-800",
                  group.status === "LOST" && "bg-red-100 text-red-800",
                  group.status === "VOIDED" && "bg-slate-100 text-slate-600",
                  group.status === "SOLD" && "bg-slate-100 text-slate-600"
                )}
              >
                {group.status === "WON" ? (
                  <>
                    <Check className="h-3 w-3" aria-hidden="true" /> Won
                  </>
                ) : group.status === "LOST" ? (
                  <>
                    <X className="h-3 w-3" aria-hidden="true" /> Lost
                  </>
                ) : group.status === "VOIDED" ? (
                  <>
                    <Ban className="h-3 w-3" aria-hidden="true" /> Voided, refunded
                  </>
                ) : (
                  "Sold"
                )}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span>
              Avg entry <strong className="text-slate-900">{group.averageEntryPrice}</strong>
            </span>
            <span>
              <strong className="text-slate-900">{group.totalShares}</strong> shares
            </span>
            {group.committedShares !== "0" ? (
              <LockedShareValue
                availableShares={group.availableShares}
                lockedShares={group.committedShares}
              />
            ) : null}
            <span>
              <strong className="text-slate-900">{group.availableShares}</strong> available
            </span>
            {showSellValue ? (
              <span className="text-slate-500">
                Current value: <strong className="text-slate-900">{group.currentSellValue}</strong>
              </span>
            ) : null}
            {showRealizedResult && group.realizedPoints ? (
              <span
                className={cn(
                  "font-medium",
                  Number(group.realizedPoints) >= 0 ? "text-emerald-600" : "text-red-600"
                )}
              >
                Realized: {group.realizedPoints} pts
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => onToggleExpanded(key)}
            className="min-h-9 rounded-md border border-slate-200 px-3 py-1 text-sm font-medium text-slate-700 hover:border-slate-400"
          >
            {expanded
              ? "Hide lots"
              : `${group.lots.length} lot${group.lots.length !== 1 ? "s" : ""}`}
          </button>

          {canSellAll && onSellAll ? (
            <button
              type="button"
              disabled={sellAllDisabled}
              onClick={() => onSellAll(key)}
              className={cn(
                "min-h-9 rounded-md px-3 py-1 text-sm font-medium",
                "border border-slate-200 bg-white text-slate-700 hover:border-slate-400",
                sellAllDisabled && "cursor-not-allowed opacity-60"
              )}
            >
              Sell all available
            </button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div id={detailsId} className="border-t border-slate-200">
          {group.lots.map((lot) => (
            <PositionLotRow
              key={lot.id}
              lot={lot}
              showSellAction={canSellLots}
              onSell={onSellLot ?? (() => {})}
              sellDisabled={sellLotDisabled}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
