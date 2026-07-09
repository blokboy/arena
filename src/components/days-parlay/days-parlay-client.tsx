"use client";

import React, { useEffect, useState } from "react";

import { LegBackerList, type LegBackerStake } from "@/components/parlays/leg-backer-list";
import { LegTimeline, type LegTimelineLeg } from "@/components/parlays/leg-timeline";
import { ClaimPicker } from "@/components/days-parlay/claim-picker";
import { DaysParlayBackLegForm } from "@/components/days-parlay/days-parlay-back-leg-form";
import { HouseBalanceStat } from "@/components/days-parlay/house-balance-stat";
import { RolloverCounter } from "@/components/days-parlay/rollover-counter";
import { UtcResetCaption } from "@/components/days-parlay/utc-reset-caption";
import type { DaysParlayDetail, DaysParlayDetailLeg } from "@/server/days-parlay";

type FetchStatus = "loading" | "success" | "error";

export function DaysParlayClient() {
  const [status, setStatus] = useState<FetchStatus>("loading");
  const [detail, setDetail] = useState<DaysParlayDetail | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    fetch("/api/days-parlay")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("DAYS_PARLAY_REQUEST_FAILED");
        }
        const body = (await response.json()) as { data: DaysParlayDetail };
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
  }, [reloadToken]);

  if (status === "loading") {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        Loading Day&apos;s Parlay…
      </div>
    );
  }

  if (status === "error" || !detail) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        This Day&apos;s Parlay could not be loaded.
      </p>
    );
  }

  const activeLeg = detail.legs.find((leg) => leg.status === "ACTIVE") ?? null;

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
    warning:
      leg.status === "PENDING" || leg.status === "ACTIVE"
        ? "Other users' earlier legs can fail first, breaking the chain."
        : null
  }));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950">{detail.name}</h1>
        <div className="mt-1 flex items-center gap-3 text-sm text-slate-600">
          <span>
            {detail.legs.length} leg{detail.legs.length === 1 ? "" : "s"}
            {activeLeg ? <> · live: {activeLeg.market.question}</> : null}
          </span>
        </div>
        <UtcResetCaption />
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <HouseBalanceStat houseBalance={detail.houseBalance} />
        <RolloverCounter rolloverCount={detail.rolloverCount} />
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Your contribution</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">
            {detail.myContributedPrincipal}
          </p>
        </div>
      </div>

      <LegTimeline legs={timelineLegs} />

      {detail.legs.map((leg) => (
        <LegSection
          key={leg.id}
          leg={leg}
          parlayId={detail.id}
          onCommitted={() => setReloadToken((token) => token + 1)}
        />
      ))}

      {detail.status === "ACTIVE" ? (
        <section className="flex flex-col gap-4 rounded-md border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-medium text-slate-950">Claim a market</h2>
          <p className="text-xs text-slate-500">
            These shares will be locked into this Day&apos;s Parlay. If an earlier leg fails before
            your leg is reached, your commitment is lost to HOUSE.
          </p>
          <ClaimPicker
            eligibleEvents={detail.eligibleEvents}
            onClaimed={() => setReloadToken((token) => token + 1)}
          />
        </section>
      ) : null}
    </div>
  );
}

function LegSection({
  leg,
  parlayId,
  onCommitted
}: {
  leg: DaysParlayDetailLeg;
  parlayId: string;
  onCommitted: () => void;
}) {
  return (
    <section
      id={`leg-${leg.id}`}
      className="flex flex-col gap-4 rounded-md border border-slate-200 bg-white p-4"
    >
      <h2 className="text-lg font-medium text-slate-950">
        {leg.status === "ACTIVE" ? "Active leg" : leg.market.question}
      </h2>
      {leg.claimedBy ? (
        <p className="text-xs text-slate-500">Claimed by {leg.claimedBy.username}</p>
      ) : null}
      <LegBackerList stakes={toLegBackerStakes(leg)} />

      {leg.status === "ACTIVE" || leg.status === "PENDING" ? (
        <>
          <p className="text-xs text-amber-700">
            Other users&apos; earlier legs can fail first, breaking the chain and forfeiting your
            stake to HOUSE.
          </p>
          <DaysParlayBackLegForm
            leg={leg}
            onCommitted={onCommitted}
          />
        </>
      ) : null}
    </section>
  );
}

function sumAmounts(stakes: DaysParlayDetailLeg["stakes"]): string {
  return stakes.reduce((total, stake) => total + Number(stake.amount), 0).toString();
}

function toLegBackerStakes(leg: DaysParlayDetailLeg): LegBackerStake[] {
  return leg.stakes.map((stake) => ({
    user: stake.user,
    amount: stake.amount,
    shares: stake.shares,
    averageEntryPrice: stake.averageEntryPrice,
    status: stake.status as LegBackerStake["status"]
  }));
}
