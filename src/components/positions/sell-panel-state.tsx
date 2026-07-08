"use client";

import React from "react";

import { LockedShareValue } from "@/components/positions/locked-share-value";

type SellPanelStateKind =
  | "no-position"
  | "all-locked"
  | "market-closed"
  | "price-unavailable"
  | "loading";

type SellPanelStateProps = {
  kind: SellPanelStateKind;
  availableShares?: string;
  lockedShares?: string;
};

export function SellPanelState({ kind, availableShares, lockedShares }: SellPanelStateProps) {
  if (kind === "no-position") {
    return (
      <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
        You don't have a position on this outcome. Buy first to see sell options.
      </p>
    );
  }

  if (kind === "all-locked") {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
        <p>All shares are locked into parlays.</p>
        {lockedShares ? (
          <LockedShareValue
            availableShares={availableShares ?? "0"}
            lockedShares={lockedShares}
            className="mt-1"
          />
        ) : null}
      </div>
    );
  }

  if (kind === "market-closed") {
    return (
      <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
        This market is closed. Selling is unavailable.
      </p>
    );
  }

  if (kind === "price-unavailable") {
    return (
      <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
        Current sell price is unavailable. Check back after the next price sync.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {[0, 1].map((index) => (
        <div
          key={index}
          className="h-14 rounded-md bg-slate-50 p-3 text-sm text-slate-400"
        >
          Loading position data
        </div>
      ))}
    </div>
  );
}
