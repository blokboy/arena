"use client";

import React, { useEffect, useState } from "react";

import { ActiveLegStickyMarker } from "@/components/parlays/active-leg-sticky-marker";
import { EligiblePositionCommitSelector } from "@/components/parlays/eligible-position-commit-selector";
import { LegBackerList, type LegBackerStake } from "@/components/parlays/leg-backer-list";
import { LegTimeline, type LegTimelineLeg } from "@/components/parlays/leg-timeline";
import { RolloverControl, type MemberVoteTally } from "@/components/parlays/rollover-control";
import type { EligiblePositionLot, SelectedCommitments } from "@/components/parlays/types";

type DetailStake = {
  user: { id: string; username: string };
  amount: string;
  shares: string;
  averageEntryPrice: string;
  status: string;
  // Settlement-driven fields, additive/optional (see
  // docs/prds/points-prediction-market.md Part III §5).
  payout?: string;
  exitPrice?: string | null;
  exitedAt?: string | null;
  rolledForwardFromLegId?: string | null;
  rolledForwardToLegId?: string | null;
};

type DetailLeg = {
  id: string;
  outcomeIndex: number;
  status: string;
  market: {
    gammaId: string;
    question: string;
    endDate: string | null;
    bestBid: string | null;
    bestAsk: string | null;
  };
  stakes: DetailStake[];
  memberVoteTally: MemberVoteTally;
  callerStake: {
    amount: string;
    shares: string;
    status: string;
  } | null;
  nextLegBestAsk: string | null;
  isFinalLeg: boolean;
};

type ParlayDetail = {
  id: string;
  name: string;
  status: string;
  kind: "REGULAR";
  members: Array<{ userId: string; username: string }>;
  legs: DetailLeg[];
  caller: {
    id: string;
    username: string;
    isMember: boolean;
  };
};

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

type FetchStatus = "loading" | "success" | "error";

export function ParlayDetailClient({
  parlayId,
  currentUserId
}: {
  parlayId: string;
  currentUserId: string;
}) {
  const [status, setStatus] = useState<FetchStatus>("loading");
  const [detail, setDetail] = useState<ParlayDetail | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    fetch(`/api/parlays/${parlayId}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("PARLAY_DETAIL_REQUEST_FAILED");
        }
        const body = (await response.json()) as { data: ParlayDetail };
        return body.data;
      })
      .then((data) => {
        if (!active) return;
        setDetail(data);
        setStatus("success");
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [parlayId, reloadToken]);

  if (status === "loading") {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        Loading parlay…
      </div>
    );
  }

  if (status === "error" || !detail) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        This parlay could not be loaded.
      </p>
    );
  }

  const isMember = detail.members.some((member) => member.userId === currentUserId);
  const activeLeg = detail.legs.find((leg) => leg.status === "ACTIVE") ?? null;
  const isFinalLeg = activeLeg ? detail.legs[detail.legs.length - 1]?.id === activeLeg.id : false;

  const timelineLegs: LegTimelineLeg[] = detail.legs.map((leg) => ({
    id: leg.id,
    status: leg.status as LegTimelineLeg["status"],
    endDate: leg.market.endDate ?? new Date(0).toISOString(),
    marketQuestion: leg.market.question,
    outcomeLabel: `Outcome ${leg.outcomeIndex}`,
    aggregateStakeAmount: sumAmounts(leg.stakes),
    backerCount: leg.stakes.length,
    bestBid: leg.market.bestBid,
    bestAsk: leg.market.bestAsk,
    // Only a leg that hasn't resolved yet (still PENDING or currently ACTIVE)
    // is subject to the no-early-cashout rule. Every terminal leg state —
    // WON, LOST, ROLLED_OVER, VOIDED — has already left the "locked, at
    // risk" state one way or another, so the copy would be stale/misleading
    // there (PRD Part II §2.5).
    warning:
      leg.status === "PENDING" || leg.status === "ACTIVE"
        ? "Parlay stakes are locked until the final leg resolves."
        : null
  }));

  const isTerminalParlay =
    detail.status === "WON" || detail.status === "LOST" || detail.status === "VOIDED";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950">{detail.name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {detail.members.length} member{detail.members.length === 1 ? "" : "s"}
          {activeLeg ? <> · currently live: {activeLeg.market.question}</> : null}
        </p>
      </header>

      <ActiveLegStickyMarker legs={timelineLegs} />

      <LegTimeline legs={timelineLegs} />

      {/* One backer breakdown per leg, not just the active one — a
          settlement-resolved leg's payout/rollforward-link data (PRD Part
          III §5) has to stay reachable on every leg, not only whichever one
          happens to be active/final right now. Actionable controls
          (rollover vote, back-this-leg) stay scoped to the active leg. */}
      {detail.legs.map((leg) => (
        <section
          key={leg.id}
          className="flex flex-col gap-4 rounded-md border border-slate-200 bg-white p-4"
        >
          <h2 className="text-lg font-medium text-slate-950">
            {leg.status === "ACTIVE" ? "Active leg" : leg.market.question}
          </h2>
          <LegBackerList stakes={toLegBackerStakes(leg)} />

          {leg.id === activeLeg?.id ? (
            <>
              <RolloverControl
                parlayId={parlayId}
                legId={leg.id}
                currentUserId={currentUserId}
                memberVoteTally={leg.memberVoteTally}
                callerStake={leg.callerStake}
                currentLegMarket={{ bestBid: leg.market.bestBid }}
                nextLegMarket={{ bestAsk: leg.nextLegBestAsk }}
                isFinalLeg={isFinalLeg}
                onVoted={() => setReloadToken((token) => token + 1)}
              />

              <BackActiveLegForm
                parlayId={parlayId}
                activeLeg={leg}
                onCommitted={() => setReloadToken((token) => token + 1)}
              />
            </>
          ) : null}
        </section>
      ))}

      {/* No early cash-out control exists anywhere in the parlay UI
          (PRD Part II §2.5) — nothing below intentionally renders a
          cash-out/sell affordance for parlay stakes, terminal or not. */}

      {!isTerminalParlay ? (
        isMember ? (
          <AppendLegSection
            parlayId={parlayId}
            onCommitted={() => setReloadToken((token) => token + 1)}
          />
        ) : (
          <p id="append-leg-reason" className="text-xs text-slate-500">
            Only parlay members can append new legs.
          </p>
        )
      ) : null}
    </div>
  );
}

function sumAmounts(stakes: DetailStake[]): string {
  return stakes.reduce((total, stake) => total + Number(stake.amount), 0).toString();
}

function toLegBackerStakes(leg: DetailLeg): LegBackerStake[] {
  return leg.stakes.map((stake) => ({
    user: stake.user,
    amount: stake.amount,
    shares: stake.shares,
    averageEntryPrice: stake.averageEntryPrice,
    status: stake.status as LegBackerStake["status"],
    payout: stake.payout,
    exitPrice: stake.exitPrice,
    exitedAt: stake.exitedAt,
    rolledForwardFromLegId: stake.rolledForwardFromLegId,
    rolledForwardToLegId: stake.rolledForwardToLegId
  }));
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

function BackActiveLegForm({
  parlayId,
  activeLeg,
  onCommitted
}: {
  parlayId: string;
  activeLeg: DetailLeg;
  onCommitted: () => void;
}) {
  const [lots, setLots] = useState<EligiblePositionLot[]>([]);
  const [selected, setSelected] = useState<SelectedCommitments>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    fetch(`/api/positions?marketId=${encodeURIComponent(activeLeg.market.gammaId)}`)
      .then(async (response) => {
        const body = (await response.json()) as { positions?: PositionLot[] };
        return body.positions ?? [];
      })
      .then((positions) => {
        if (!active) return;
        setLots(toEligibleLots(positions, activeLeg.outcomeIndex));
      })
      .catch(() => {
        if (!active) return;
        setLots([]);
      });

    return () => {
      active = false;
    };
  }, [activeLeg.market.gammaId, activeLeg.outcomeIndex]);

  const commitments = commitmentsFromSelection(selected);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);

        const response = await fetch(`/api/parlays/${parlayId}/legs/${activeLeg.id}/stake`, {
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

function AppendLegSection({
  parlayId,
  onCommitted
}: {
  parlayId: string;
  onCommitted: () => void;
}) {
  const [marketId, setMarketId] = useState("");
  const [outcomeIndex, setOutcomeIndex] = useState("0");
  const [lots, setLots] = useState<EligiblePositionLot[]>([]);
  const [selected, setSelected] = useState<SelectedCommitments>({});
  const [error, setError] = useState<{ code: string; details?: Record<string, string> } | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  const commitments = commitmentsFromSelection(selected);

  return (
    <section className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-medium text-slate-950">Append a leg</h2>
      <p className="text-xs text-slate-500">
        These shares will be locked into this parlay. If an earlier leg fails before this leg is
        reached, this commitment is lost to HOUSE.
      </p>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Market id
          <input
            className="min-h-11 rounded-md border border-slate-300 px-3"
            value={marketId}
            onChange={(event) => setMarketId(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Outcome index
          <input
            type="number"
            min="0"
            className="min-h-11 w-24 rounded-md border border-slate-300 px-3"
            value={outcomeIndex}
            onChange={(event) => setOutcomeIndex(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="min-h-11 self-end rounded-md border border-slate-300 px-4 text-sm font-medium"
          onClick={async () => {
            if (marketId.trim() === "") return;
            const response = await fetch(
              `/api/positions?marketId=${encodeURIComponent(marketId.trim())}`
            );
            const body = (await response.json()) as { positions?: PositionLot[] };
            setLots(toEligibleLots(body.positions ?? [], Number(outcomeIndex)));
          }}
        >
          Load eligible lots
        </button>
      </div>

      <EligiblePositionCommitSelector
        lots={lots}
        selectedCommitments={selected}
        onCommitmentChange={(positionId, shares) =>
          setSelected((current) => ({ ...current, [positionId]: shares }))
        }
        errorMessage={null}
      />

      {error?.code === "LEG_APPEND_TOO_EARLY" ? (
        <p role="alert" className="text-xs text-red-600">
          This market resolves before the current active leg (
          {error.details?.activeLegEndDate ? formatDate(error.details.activeLegEndDate) : "?"}) — it
          can't be appended here.
        </p>
      ) : error ? (
        <p role="alert" className="text-xs text-red-600">
          {error.code}
        </p>
      ) : null}

      <button
        type="button"
        disabled={submitting || commitments.length === 0 || marketId.trim() === ""}
        className="min-h-11 self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        onClick={async () => {
          setSubmitting(true);
          setError(null);

          const response = await fetch(`/api/parlays/${parlayId}/legs`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              marketId: marketId.trim(),
              outcomeIndex: Number(outcomeIndex),
              commitments
            })
          });

          setSubmitting(false);

          if (!response.ok) {
            const body = (await response.json()) as {
              error?: { code?: string; details?: Record<string, string> };
            };
            setError({ code: body.error?.code ?? "APPEND_FAILED", details: body.error?.details });
            return;
          }

          setSelected({});
          setMarketId("");
          setLots([]);
          onCommitted();
        }}
      >
        Append leg
      </button>
    </section>
  );
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(iso));
}
