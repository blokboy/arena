"use client";

import React, { useEffect, useState } from "react";

import { EligiblePositionCommitSelector } from "@/components/parlays/eligible-position-commit-selector";
import type { EligiblePositionLot, SelectedCommitments } from "@/components/parlays/types";

type PositionLot = {
  id: string;
  marketId: string;
  marketQuestion: string;
  outcomeIndex: number;
  outcomeLabel: string;
  entryPrice: string;
  availableShares: string;
  status: string;
  committedShares?: string;
  purchasedAt?: string;
};

type DaysParlayLeg = {
  id: string;
  status: string;
  outcomeIndex: number;
  market: {
    gammaId: string;
    question: string;
    endDate: string | null;
    bestBid: string | null;
    bestAsk: string | null;
  };
};

type DaysParlayBackLegFormProps = {
  leg: DaysParlayLeg;
  onCommitted: () => void;
};

export function DaysParlayBackLegForm({ leg, onCommitted }: DaysParlayBackLegFormProps) {
  const [lots, setLots] = useState<EligiblePositionLot[]>([]);
  const [selected, setSelected] = useState<SelectedCommitments>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    fetch(`/api/positions?marketId=${encodeURIComponent(leg.market.gammaId)}`)
      .then(async (response) => {
        const body = (await response.json()) as { positions?: PositionLot[] };
        return body.positions ?? [];
      })
      .then((positions) => {
        if (!active) return;
        setLots(toEligibleLots(positions, leg.outcomeIndex));
      })
      .catch(() => {
        if (!active) return;
        setLots([]);
      });

    return () => {
      active = false;
    };
  }, [leg.market.gammaId, leg.outcomeIndex]);

  const commitments = commitmentsFromSelection(selected);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);

        const response = await fetch(`/api/days-parlay/legs/${leg.id}/stake`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ commitments })
        });

        setSubmitting(false);

        if (!response.ok) {
          const body = (await response.json()) as { error?: { code?: string } };
          setError(body.error?.code ?? "STAKE_FAILED");
          return;
        }

        setSelected({});
        onCommitted();
      }}
    >
      <h3 className="text-sm font-medium text-slate-900">Back this leg</h3>
      <EligiblePositionCommitSelector
        lots={lots}
        selectedCommitments={selected}
        onCommitmentChange={(positionId, shares) =>
          setSelected((current) => ({ ...current, [positionId]: shares }))
        }
        errorMessage={error}
      />
      <button
        type="submit"
        disabled={submitting || commitments.length === 0}
        className="min-h-11 self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Back this leg
      </button>
    </form>
  );
}

function toEligibleLots(lots: PositionLot[], outcomeIndex: number): EligiblePositionLot[] {
  return lots
    .filter(
      (lot) =>
        lot.status === "OPEN" &&
        lot.outcomeIndex === outcomeIndex &&
        Number(lot.availableShares) > 0
    )
    .map((lot) => ({
      positionId: lot.id,
      marketId: lot.marketId,
      marketQuestion: lot.marketQuestion,
      outcomeIndex: lot.outcomeIndex,
      outcomeLabel: lot.outcomeLabel,
      entryPrice: lot.entryPrice,
      availableShares: lot.availableShares,
      committedShares: lot.committedShares,
      purchasedAt: lot.purchasedAt
    }));
}

function commitmentsFromSelection(
  selected: SelectedCommitments
): Array<{ positionId: string; shares: string }> {
  return Object.entries(selected)
    .filter(([, shares]) => shares.trim() !== "" && Number(shares) > 0)
    .map(([positionId, shares]) => ({ positionId, shares }));
}
