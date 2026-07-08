"use client";

import React from "react";

import { formatPoints } from "@/lib/money";

type SellFeedbackState = "idle" | "success" | "error";

export type SellFeedbackErrorCode =
  | "NO_AVAILABLE_SHARES"
  | "SHARES_LOCKED"
  | "MARKET_CLOSED"
  | "PRICE_UNAVAILABLE"
  | "POSITION_NOT_FOUND"
  | "UNKNOWN";

type SellFeedbackProps = {
  state: SellFeedbackState;
  soldShares?: string;
  creditedPoints?: string;
  errorCode?: SellFeedbackErrorCode;
};

export function SellFeedback({ state, soldShares, creditedPoints, errorCode }: SellFeedbackProps) {
  if (state === "idle") {
    return null;
  }

  if (state === "success") {
    return (
      <div
        role="status"
        className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
      >
        <p>
          Sold {soldShares} available shares for {creditedPoints ? formatPoints(Number(creditedPoints)) : "0"} pts.
        </p>
      </div>
    );
  }

  const message = getErrorMessage(errorCode);
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

function getErrorMessage(code?: string): string {
  if (code === "NO_AVAILABLE_SHARES") return "No available shares to sell.";
  if (code === "SHARES_LOCKED") return "These shares are locked into parlays.";
  if (code === "MARKET_CLOSED") return "This market is closed.";
  if (code === "PRICE_UNAVAILABLE") return "Current sell price is unavailable.";
  if (code === "POSITION_NOT_FOUND") return "You do not own this position.";
  return "Sell failed. Try again.";
}
