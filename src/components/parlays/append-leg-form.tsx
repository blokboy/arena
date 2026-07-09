"use client";

import React, { useState } from "react";

export type AppendLegFormError = {
  code: "LEG_APPEND_TOO_EARLY";
  details: { activeLegEndDate: string; attemptedMarketEndDate: string };
};

type EligibleLot = {
  positionId: string;
  marketQuestion: string;
  outcomeLabel: string;
  availableShares: string;
};

type AppendLegFormProps = {
  eligibleLot: EligibleLot;
  onSubmit: (input: { positionId: string; shares: string }) => void;
  error: AppendLegFormError | null;
};

export function AppendLegForm({ eligibleLot, onSubmit, error }: AppendLegFormProps) {
  const [shares, setShares] = useState("");

  const sharesValue = Number(shares);
  const isValid = shares.trim() !== "" && sharesValue > 0 && sharesValue <= Number(eligibleLot.availableShares);

  return (
    <form
      className="flex flex-col gap-2 text-sm"
      onSubmit={(event) => {
        event.preventDefault();

        if (isValid) {
          onSubmit({ positionId: eligibleLot.positionId, shares });
        }
      }}
    >
      <p className="text-slate-700">
        {eligibleLot.marketQuestion} — {eligibleLot.outcomeLabel} ({eligibleLot.availableShares} shares available)
      </p>

      <label htmlFor="append-leg-shares" className="font-medium text-slate-900">
        Shares to commit
      </label>
      <input
        id="append-leg-shares"
        type="number"
        value={shares}
        onChange={(event) => setShares(event.target.value)}
      />

      <p className="text-xs text-slate-500">
        These shares will be locked into this parlay. If an earlier leg fails before this leg is
        reached, this commitment is lost to HOUSE.
      </p>

      {error?.code === "LEG_APPEND_TOO_EARLY" ? (
        <p role="alert" className="text-xs text-red-600">
          This market resolves before the current active leg (
          {formatDate(error.details.activeLegEndDate)}) — it can't be appended here.
        </p>
      ) : null}

      <button type="submit" disabled={!isValid} className="self-start rounded-md border px-3 py-1.5">
        Append leg
      </button>
    </form>
  );
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(iso));
}
