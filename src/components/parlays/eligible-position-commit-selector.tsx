"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";

import { cn } from "@/lib/cn";
import type { EligiblePositionLot, SelectedCommitments } from "@/components/parlays/types";

type ControlledProps = {
  lots: readonly EligiblePositionLot[];
  selectedCommitments: SelectedCommitments;
  disabled?: boolean;
  className?: string;
  errorMessage?: string | null;
  onCommitmentChange?: (positionId: string, shares: string) => void;
};

type LegacyPosition = {
  positionId: string;
  marketQuestion: string;
  outcomeLabel: string;
  entryPrice: string;
  availableShares: string;
};

type LegacyProps = {
  positions: readonly LegacyPosition[];
  onChange?: (commitments: Array<{ positionId: string; shares: string }>) => void;
};

type EligiblePositionCommitSelectorProps = ControlledProps | LegacyProps;

export function EligiblePositionCommitSelector({ ...props }: EligiblePositionCommitSelectorProps) {
  const isLegacyMode = "positions" in props;
  const [legacyCommitments, setLegacyCommitments] = useState<SelectedCommitments>({});

  const lots = useMemo<readonly EligiblePositionLot[]>(
    () =>
      isLegacyMode
        ? props.positions.map((position) => ({
            positionId: position.positionId,
            marketId: "",
            marketQuestion: position.marketQuestion,
            outcomeIndex: 0,
            outcomeLabel: position.outcomeLabel,
            entryPrice: position.entryPrice,
            availableShares: position.availableShares
          }))
        : props.lots,
    [isLegacyMode, props]
  );

  const selectedCommitments = isLegacyMode ? legacyCommitments : props.selectedCommitments;
  const disabled = isLegacyMode ? false : props.disabled;
  const className = isLegacyMode ? undefined : props.className;
  const errorMessage = isLegacyMode ? null : props.errorMessage;

  useEffect(() => {
    if (!isLegacyMode) {
      return;
    }

    const commitments = Object.entries(legacyCommitments)
      .filter(([positionId, shares]) => {
        const lot = lots.find((candidate) => candidate.positionId === positionId);
        return lot && shares.trim().length > 0 && getCommitmentError(shares, lot) === null;
      })
      .map(([positionId, shares]) => ({ positionId, shares }));

    props.onChange?.(commitments);
  }, [isLegacyMode, legacyCommitments, lots, props]);

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
        These shares become unavailable after commit. Committed shares are locked immediately and
        are lost to HOUSE if an earlier leg fails first.
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
              const lotError = getCommitmentError(selected, lot);

              return (
                <div
                  key={lot.positionId}
                  className={cn(
                    "grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.8fr)_auto_auto_auto_9rem] md:items-center",
                    isSelected && "bg-emerald-50/70"
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950">
                      {lot.marketQuestion}
                    </p>
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
                    <span>
                      {isSelected ? `${selectedNumeric} selected` : "Will lock on commit"}
                    </span>
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
                      aria-label={`Shares to commit for ${lot.positionId || lot.marketQuestion} ${lot.outcomeLabel} ${lot.entryPrice}`}
                      value={selected}
                      disabled={disabled}
                      onChange={(event) => {
                        if (isLegacyMode) {
                          setLegacyCommitments((current) => ({
                            ...current,
                            [lot.positionId]: event.target.value
                          }));
                          return;
                        }

                        props.onCommitmentChange?.(lot.positionId, event.target.value);
                      }}
                      className={cn(
                        "min-h-11 w-28 rounded-md border border-slate-300 px-3 py-2 text-right text-sm",
                        "focus:border-slate-900 focus:outline-none",
                        isSelected && "border-emerald-400 bg-white",
                        disabled && "cursor-not-allowed bg-slate-50 opacity-70"
                      )}
                    />
                  </label>
                  {lotError ? (
                    <p className="text-sm text-red-700 md:col-start-5 md:text-right">{lotError}</p>
                  ) : null}
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
          shares across <span className="font-medium text-slate-950">{selectedLots.length}</span>{" "}
          lots
        </p>
        <p className="text-xs text-slate-500">
          These selections become part of the locked parlay stake.
        </p>
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

function getCommitmentError(value: string, lot: EligiblePositionLot): string | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (!/^(?:\d+|\d*\.\d+)$/.test(trimmed) || Number(trimmed) <= 0) {
    return "Enter a positive share amount.";
  }

  if (Number(trimmed) > Number(lot.availableShares)) {
    return `Only ${lot.availableShares} shares available.`;
  }

  return null;
}
