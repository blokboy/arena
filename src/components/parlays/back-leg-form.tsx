"use client";

import React, { useState } from "react";

export type BackLegFormError = {
  code: string;
  message: string;
};

type EligibleLot = {
  positionId: string;
  marketQuestion: string;
  outcomeLabel: string;
  availableShares: string;
};

type BackLegFormProps = {
  eligibleLot: EligibleLot;
  isMember: boolean;
  onSubmit: (input: { positionId: string; shares: string }) => void;
  error: BackLegFormError | null;
};

export function BackLegForm({ eligibleLot, isMember, onSubmit, error }: BackLegFormProps) {
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

      <label htmlFor="back-leg-shares" className="font-medium text-slate-900">
        Shares to commit
      </label>
      <input
        id="back-leg-shares"
        type="number"
        value={shares}
        onChange={(event) => setShares(event.target.value)}
      />

      <p className="text-xs text-slate-500">
        These shares will be locked into this parlay. If an earlier leg fails before this leg is
        reached, this commitment is lost to HOUSE.
      </p>

      {!isMember ? (
        <p className="text-xs text-slate-500">
          Backing this leg does not grant rollover-voting rights unless you're also a formal
          member of this parlay.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error.message}
        </p>
      ) : null}

      <button type="submit" disabled={!isValid} className="self-start rounded-md border px-3 py-1.5">
        Back this leg
      </button>
    </form>
  );
}
