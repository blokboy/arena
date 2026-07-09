"use client";

import React, { useState } from "react";

import { EligiblePositionCommitSelector } from "@/components/parlays/eligible-position-commit-selector";
import type { DaysParlayEligibleEvent, DaysParlayEligibleMarket } from "@/server/days-parlay";

type ClaimPickerProps = {
  eligibleEvents: DaysParlayEligibleEvent[];
  onClaimed: () => void;
};

type ClaimError = {
  code: string;
  details?: Record<string, string>;
};

export function ClaimPicker({ eligibleEvents, onClaimed }: ClaimPickerProps) {
  const [expandedMarketId, setExpandedMarketId] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null);
  const [commitments, setCommitments] = useState<Record<string, string>>({});
  const [error, setError] = useState<ClaimError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hasClaimableMarkets = eligibleEvents.some((event) =>
    event.markets.some((m) => m.claimStatus === "available" && m.myAvailableLots.length > 0)
  );

  if (!hasClaimableMarkets) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
        No markets in your portfolio are eligible to claim right now — buy shares in a
        today-resolving market first, then claim it here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {eligibleEvents.map((event) => {
        const availableMarkets = event.markets.filter(
          (m) => m.claimStatus === "available" && m.myAvailableLots.length > 0
        );
        if (availableMarkets.length === 0) return null;

        return (
          <div key={event.eventId} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-slate-900">{event.title}</h3>
            <div className="flex flex-col gap-2">
              {availableMarkets.map((market) => (
                <MarketClaimCard
                  key={market.marketId}
                  market={market}
                  expanded={expandedMarketId === market.marketId}
                  selectedOutcome={selectedOutcome}
                  commitments={commitments}
                  error={expandedMarketId === market.marketId ? error : null}
                  submitting={submitting}
                  onExpand={() => {
                    setExpandedMarketId(market.marketId);
                    setSelectedOutcome(null);
                    setCommitments({});
                    setError(null);
                  }}
                  onCollapse={() => {
                    setExpandedMarketId(null);
                    setSelectedOutcome(null);
                    setCommitments({});
                    setError(null);
                  }}
                  onOutcomeSelect={setSelectedOutcome}
                  onCommitmentChange={(positionId, shares) =>
                    setCommitments((prev) => ({ ...prev, [positionId]: shares }))
                  }
                  onSubmit={async () => {
                    if (selectedOutcome === null) return;

                    setSubmitting(true);
                    setError(null);

                    const selectedCommitments = Object.entries(commitments)
                      .filter(([, shares]) => shares.trim() !== "" && Number(shares) > 0)
                      .map(([positionId, shares]) => ({ positionId, shares }));

                    if (selectedCommitments.length === 0) {
                      setError({ code: "NO_COMMITMENTS" });
                      setSubmitting(false);
                      return;
                    }

                    try {
                      const response = await fetch("/api/days-parlay/legs", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          marketId: market.marketId,
                          outcomeIndex: selectedOutcome,
                          commitments: selectedCommitments
                        })
                      });

                      if (!response.ok) {
                        const body = (await response.json()) as {
                          error?: { code?: string; details?: Record<string, string> };
                        };
                        setError({
                          code: body.error?.code ?? "CLAIM_FAILED",
                          details: body.error?.details
                        });
                        return;
                      }

                      setExpandedMarketId(null);
                      setSelectedOutcome(null);
                      setCommitments({});
                      setError(null);
                      onClaimed();
                    } catch {
                      setError({ code: "CLAIM_FAILED" });
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MarketClaimCard({
  market,
  expanded,
  selectedOutcome,
  commitments,
  error,
  submitting,
  onExpand,
  onCollapse,
  onOutcomeSelect,
  onCommitmentChange,
  onSubmit
}: {
  market: DaysParlayEligibleMarket;
  expanded: boolean;
  selectedOutcome: number | null;
  commitments: Record<string, string>;
  error: ClaimError | null;
  submitting: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onOutcomeSelect: (index: number) => void;
  onCommitmentChange: (positionId: string, shares: string) => void;
  onSubmit: () => void;
}) {
  const lotsByOutcome = groupLotsByOutcome(market.myAvailableLots);

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-950">{market.question}</p>
          <p className="mt-1 text-xs text-slate-500">
            {formatEndDate(market.endDate)}
            {market.bestBid != null || market.bestAsk != null ? (
              <>
                {" "}
                · bid {market.bestBid ?? "—"} / ask {market.bestAsk ?? "—"}
              </>
            ) : null}
          </p>
        </div>
        {!expanded ? (
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white"
            onClick={onExpand}
          >
            Claim
          </button>
        ) : (
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
            onClick={onCollapse}
          >
            Cancel
          </button>
        )}
      </div>

      {expanded ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-slate-700">Select outcome</p>
            <div className="flex flex-wrap gap-2">
              {market.outcomes.map((outcome, index) => {
                const outcomeLots = lotsByOutcome.get(index) ?? [];
                const hasLots = outcomeLots.length > 0;

                return (
                  <button
                    key={index}
                    type="button"
                    disabled={!hasLots || submitting}
                    className={`min-h-9 rounded-md border px-3 py-1.5 text-sm font-medium ${
                      selectedOutcome === index
                        ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                        : hasLots
                          ? "border-slate-200 text-slate-700 hover:border-slate-300"
                          : "cursor-not-allowed border-slate-100 text-slate-400"
                    }`}
                    onClick={() => onOutcomeSelect(index)}
                  >
                    {outcome}
                    {hasLots ? ` (${outcomeLots.length})` : null}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedOutcome !== null ? (
            <CommitmentForm
              lots={lotsByOutcome.get(selectedOutcome) ?? []}
              commitments={commitments}
              onCommitmentChange={onCommitmentChange}
            />
          ) : null}

          {error?.code === "LEG_APPEND_TOO_EARLY" ? (
            <p role="alert" className="text-xs text-red-600">
              This market resolves before the current active leg (
              {error.details?.activeLegEndDate ? formatDate(error.details.activeLegEndDate) : "?"})
              — it can&apos;t be claimed here.
            </p>
          ) : error ? (
            <p role="alert" className="text-xs text-red-600">
              {error.code === "MARKET_ALREADY_CLAIMED"
                ? "This market was already claimed by another user."
                : error.code}
            </p>
          ) : null}

          <button
            type="button"
            disabled={submitting || selectedOutcome === null}
            className="min-h-11 self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={onSubmit}
          >
            {submitting ? "Claiming…" : "Claim market"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CommitmentForm({
  lots,
  commitments,
  onCommitmentChange
}: {
  lots: DaysParlayEligibleMarket["myAvailableLots"];
  commitments: Record<string, string>;
  onCommitmentChange: (positionId: string, shares: string) => void;
}) {
  return (
    <EligiblePositionCommitSelector
      lots={lots.map((lot) => ({
        positionId: lot.positionId,
        marketId: "",
        marketQuestion: "",
        outcomeIndex: lot.outcomeIndex,
        outcomeLabel: lot.outcomeLabel,
        entryPrice: lot.entryPrice,
        availableShares: lot.availableShares
      }))}
      selectedCommitments={commitments}
      onCommitmentChange={onCommitmentChange}
      errorMessage={null}
    />
  );
}

function groupLotsByOutcome(
  lots: DaysParlayEligibleMarket["myAvailableLots"]
): Map<number, DaysParlayEligibleMarket["myAvailableLots"]> {
  const grouped = new Map<number, DaysParlayEligibleMarket["myAvailableLots"]>();

  for (const lot of lots) {
    const existing = grouped.get(lot.outcomeIndex) ?? [];
    existing.push(lot);
    grouped.set(lot.outcomeIndex, existing);
  }

  return grouped;
}

function formatEndDate(iso: string | null): string {
  if (!iso) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(new Date(iso));
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(iso));
}
