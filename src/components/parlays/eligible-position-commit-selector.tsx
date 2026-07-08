"use client";

import React from "react";
import { Lock } from "lucide-react";

import { cn } from "@/lib/cn";
import type { EligiblePositionLot, SelectedCommitments } from "@/components/parlays/types";

type EligiblePositionCommitSelectorProps = {
  lots: readonly EligiblePositionLot[];
  selectedCommitments: SelectedCommitments;
  disabled?: boolean;
  className?: string;
  errorMessage?: string | null;
  onCommitmentChange?: (positionId: string, shares: string) => void;
};

export function EligiblePositionCommitSelector({
  lots,
  selectedCommitments,
  disabled,
  className,
  errorMessage,
  onCommitmentChange
}: EligiblePositionCommitSelectorProps) {
  const selectedLots = lots.filter((lot) => Number(selectedCommitments[lot.positionId] ?? 0) > 0);
  const selectedShares = selectedLots.reduce(
    (total, lot) => total + Number(selectedCommitments[lot.positionId] ?? 0),
    0
  );

  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-500">Step 2 of 2</p>
          <h2 className="text-xl font-semibold text-slate-950">First leg commitment</h2>
          <p className="text-sm leading-6 text-slate-600">
            Pick eligible portfolio lots and commit shares that will lock immediately after submit.
          </p>
        </div>

        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
          {lots.length} eligible lot{lots.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        These shares become unavailable after commit. If an earlier leg fails first, this commitment is
        lost to HOUSE.
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 md:grid-cols-[minmax(0,1.8fr)_auto_auto_auto_9rem]">
          <span>Lot</span>
          <span>Entry</span>
          <span>Available</span>
          <span>Locks after commit</span>
          <span className="text-right">Shares to commit</span>
        </div>

        <div className="divide-y divide-slate-100">
          {lots.length > 0 ? (
            lots.map((lot) => {
              const selected = selectedCommitments[lot.positionId] ?? "";
              const selectedNumeric = Number(selected || 0);
              const isSelected = selectedNumeric > 0;

              return (
                <div
                  key={lot.positionId}
                  className={cn(
                    "grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.8fr)_auto_auto_auto_9rem] md:items-center",
                    isSelected && "bg-emerald-50/70"
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950">{lot.marketQuestion}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {lot.outcomeLabel}
                      {lot.purchasedAt ? ` · bought ${formatPurchasedAt(lot.purchasedAt)}` : ""}
                    </p>
                  </div>

                  <div className="text-sm text-slate-700">
                    <span className="md:hidden">Entry: </span>
                    <span className="font-medium text-slate-950">{lot.entryPrice}</span>
                  </div>

                  <div className="text-sm text-slate-700">
                    <span className="md:hidden">Available: </span>
                    <span className="font-medium text-slate-950">{lot.availableShares}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    <span>{isSelected ? `${selectedNumeric} selected` : "Will lock on commit"}</span>
                  </div>

                  <label className="flex items-center justify-between gap-3 md:justify-end">
                    <span className="sr-only">
                      Shares to commit for {lot.marketQuestion} {lot.outcomeLabel}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={selected}
                      disabled={disabled}
                      onChange={(event) => onCommitmentChange?.(lot.positionId, event.target.value)}
                      className={cn(
                        "min-h-11 w-28 rounded-md border border-slate-300 px-3 py-2 text-right text-sm",
                        "focus:border-slate-900 focus:outline-none",
                        isSelected && "border-emerald-400 bg-white",
                        disabled && "cursor-not-allowed bg-slate-50 opacity-70"
                      )}
                    />
                  </label>
                </div>
              );
            })
          ) : (
            <p className="px-4 py-6 text-sm text-slate-500">No eligible lots to commit.</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm text-slate-600">
          Selected commitments: <span className="font-medium text-slate-950">{selectedShares}</span>{" "}
          shares across <span className="font-medium text-slate-950">{selectedLots.length}</span> lots
        </p>
        <p className="text-xs text-slate-500">These selections become part of the locked parlay stake.</p>
      </div>

      {errorMessage ? (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}

function formatPurchasedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}
