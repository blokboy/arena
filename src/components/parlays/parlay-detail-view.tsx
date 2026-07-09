"use client";

import React from "react";

import { ActiveLegStickyMarker } from "@/components/parlays/active-leg-sticky-marker";
import { AppendLegForm, type AppendLegFormError } from "@/components/parlays/append-leg-form";
import { BackLegForm, type BackLegFormError } from "@/components/parlays/back-leg-form";
import { LegBackerList, type LegBackerStake } from "@/components/parlays/leg-backer-list";
import { LegTimeline, type LegTimelineLeg } from "@/components/parlays/leg-timeline";
import { RolloverControl, type MemberVoteTally } from "@/components/parlays/rollover-control";

type EligibleLot = {
  positionId: string;
  marketQuestion: string;
  outcomeLabel: string;
  availableShares: string;
};

type ActiveLegDetail = {
  id: string;
  marketQuestion: string;
  bestBid: string | null;
  stakes: LegBackerStake[];
  memberVoteTally: MemberVoteTally;
  callerStake: {
    amount: string;
    shares: string;
    status: string;
  } | null;
  isFinalLeg: boolean;
  nextLegBestAsk: string | null;
};

type ParlayDetailViewProps = {
  parlay: {
    id: string;
    name: string;
    members: Array<{ userId: string; username: string }>;
  };
  legs: readonly LegTimelineLeg[];
  activeLeg: ActiveLegDetail | null;
  currentUserId: string;
  appendEligibleLot: EligibleLot | null;
  backEligibleLot: EligibleLot | null;
  onAppend: (input: { positionId: string; shares: string }) => void;
  onBack: (input: { positionId: string; shares: string }) => void;
  onVoted?: () => void;
  appendError: AppendLegFormError | null;
  backError: BackLegFormError | null;
};

export function ParlayDetailView({
  parlay,
  legs,
  activeLeg,
  currentUserId,
  appendEligibleLot,
  backEligibleLot,
  onAppend,
  onBack,
  onVoted,
  appendError,
  backError
}: ParlayDetailViewProps) {
  const isMember = parlay.members.some((member) => member.userId === currentUserId);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">{parlay.name}</h1>
        <p className="text-sm text-slate-500">{parlay.members.length} members</p>
        {activeLeg ? (
          <p className="text-sm text-slate-700">Currently live: {activeLeg.marketQuestion}</p>
        ) : null}
      </header>

      <ActiveLegStickyMarker legs={legs} />

      <LegTimeline legs={legs} />

      {activeLeg ? (
        <section className="flex flex-col gap-4">
          <LegBackerList stakes={activeLeg.stakes} />
          <RolloverControl
            parlayId={parlay.id}
            legId={activeLeg.id}
            currentUserId={currentUserId}
            memberVoteTally={activeLeg.memberVoteTally}
            callerStake={activeLeg.callerStake}
            currentLegMarket={{ bestBid: activeLeg.bestBid }}
            nextLegMarket={{ bestAsk: activeLeg.nextLegBestAsk }}
            isFinalLeg={activeLeg.isFinalLeg}
            onVoted={onVoted}
          />

          <div aria-disabled={!isMember} aria-describedby={!isMember ? "append-leg-reason" : undefined}>
            {isMember && appendEligibleLot ? (
              <AppendLegForm eligibleLot={appendEligibleLot} onSubmit={onAppend} error={appendError} />
            ) : (
              <p id="append-leg-reason" className="text-xs text-slate-500">
                Only parlay members can append new legs.
              </p>
            )}
          </div>

          {backEligibleLot ? (
            <BackLegForm
              eligibleLot={backEligibleLot}
              isMember={isMember}
              onSubmit={onBack}
              error={backError}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
