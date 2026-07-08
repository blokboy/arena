"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { EligiblePositionCommitSelector } from "@/components/parlays/eligible-position-commit-selector";
import { ParlayCommitConfirmDialog } from "@/components/parlays/parlay-commit-confirm-dialog";
import { ParlayRosterStep } from "@/components/parlays/parlay-roster-step";
import type {
  EligiblePositionLot,
  ParlayRosterMember,
  ParlayUserSearchResult,
  SelectedCommitments
} from "@/components/parlays/types";
import { WizardStepIndicator } from "@/components/parlays/wizard-step-indicator";
import { CATEGORY_TAGS, MARKET_CATEGORIES, type CachedEvent, type CachedMarket, type MarketCategory } from "@/domain/markets";
import { cn } from "@/lib/cn";

type ParlayCreateFlowProps = {
  currentUser: {
    id: string;
    username: string;
  };
};

type DraftResume = {
  id: string;
  name: string;
  invitees: ParlayRosterMember[];
};

type SearchStatus = "idle" | "loading" | "success" | "error";
type MarketStatus = "loading" | "success" | "error";
type Step = "roster" | "first-leg";

export function ParlayCreateFlow({ currentUser }: ParlayCreateFlowProps) {
  const router = useRouter();
  const draftStorageKey = `arena:create-parlay-draft:${currentUser.id}`;

  const [step, setStep] = useState<Step>("roster");
  const [name, setName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchResults, setSearchResults] = useState<ParlayUserSearchResult[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<ParlayRosterMember[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<MarketCategory>("Politics");
  const [marketStatus, setMarketStatus] = useState<MarketStatus>("loading");
  const [events, setEvents] = useState<CachedEvent[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<CachedMarket | null>(null);
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState<number | null>(null);
  const [eligibleLots, setEligibleLots] = useState<EligiblePositionLot[]>([]);
  const [selectedCommitments, setSelectedCommitments] = useState<SelectedCommitments>({});
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState<DraftResume | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [firstLegError, setFirstLegError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const raw = globalThis.localStorage?.getItem(draftStorageKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as DraftResume;
      if (parsed?.id && parsed?.name) {
        setSavedDraft(parsed);
      }
    } catch {
      globalThis.localStorage?.removeItem(draftStorageKey);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();

    if (trimmedQuery.length === 0) {
      setSearchStatus("idle");
      setSearchResults([]);
      return;
    }

    let active = true;
    const timeoutId = globalThis.setTimeout(async () => {
      setSearchStatus("loading");

      try {
        const response = await fetch(`/api/users?query=${encodeURIComponent(trimmedQuery)}`);
        if (!response.ok) {
          throw new Error("USER_SEARCH_FAILED");
        }

        const body = (await response.json()) as {
          users?: Array<{ id: string; username: string }>;
        };

        if (!active) {
          return;
        }

        const selectedIds = new Set(selectedMembers.map((member) => member.id));
        setSearchResults(
          (body.users ?? [])
            .filter((user) => user.id !== currentUser.id && !selectedIds.has(user.id))
            .map((user) => ({ id: user.id, username: user.username }))
        );
        setSearchStatus("success");
      } catch {
        if (!active) {
          return;
        }

        setSearchStatus("error");
        setSearchResults([]);
      }
    }, 200);

    return () => {
      active = false;
      globalThis.clearTimeout(timeoutId);
    };
  }, [currentUser.id, searchQuery, selectedMembers]);

  useEffect(() => {
    let active = true;

    setMarketStatus("loading");
    fetch(`/api/markets?category=${CATEGORY_TAGS[selectedCategory].slug}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("MARKETS_REQUEST_FAILED");
        }

        const body = (await response.json()) as { events?: CachedEvent[] };
        return body.events ?? [];
      })
      .then((nextEvents) => {
        if (!active) {
          return;
        }

        setEvents(nextEvents);
        setMarketStatus("success");
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setEvents([]);
        setMarketStatus("error");
      });

    return () => {
      active = false;
    };
  }, [selectedCategory]);

  useEffect(() => {
    if (!selectedMarket || selectedOutcomeIndex === null) {
      setEligibleLots([]);
      setSelectedCommitments({});
      return;
    }

    let active = true;

    fetch(`/api/positions?marketId=${encodeURIComponent(selectedMarket.gammaId)}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("POSITIONS_REQUEST_FAILED");
        }

        const body = (await response.json()) as {
          positions?: Array<{
            id: string;
            marketId: string;
            marketQuestion: string;
            outcomeIndex: number;
            outcomeLabel: string;
            status: string;
            entryPrice: string;
            availableShares: string;
            committedShares: string;
            purchasedAt: string;
          }>;
        };

        return body.positions ?? [];
      })
      .then((positions) => {
        if (!active) {
          return;
        }

        setEligibleLots(
          positions
            .filter(
              (position) =>
                position.status === "OPEN" &&
                position.outcomeIndex === selectedOutcomeIndex &&
                Number(position.availableShares) > 0
            )
            .map((position) => ({
              positionId: position.id,
              marketId: position.marketId,
              marketQuestion: position.marketQuestion,
              outcomeIndex: position.outcomeIndex,
              outcomeLabel: position.outcomeLabel,
              entryPrice: position.entryPrice,
              availableShares: position.availableShares,
              committedShares: position.committedShares,
              purchasedAt: position.purchasedAt
            }))
        );
        setSelectedCommitments({});
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setEligibleLots([]);
        setSelectedCommitments({});
      });

    return () => {
      active = false;
    };
  }, [selectedMarket, selectedOutcomeIndex]);

  const selectedCommitmentEntries = useMemo(
    () =>
      Object.entries(selectedCommitments).filter(
        ([, shares]) => shares.trim().length > 0 && Number(shares) > 0
      ),
    [selectedCommitments]
  );

  const selectedCommitmentSummary = useMemo(() => {
    const totalShares = selectedCommitmentEntries.reduce(
      (total, [, shares]) => total + Number(shares),
      0
    );

    return {
      lots: selectedCommitmentEntries.length,
      totalShares
    };
  }, [selectedCommitmentEntries]);

  function persistDraft(nextDraft: DraftResume) {
    globalThis.localStorage?.setItem(draftStorageKey, JSON.stringify(nextDraft));
    setSavedDraft(nextDraft);
  }

  function clearSavedDraft() {
    globalThis.localStorage?.removeItem(draftStorageKey);
    setSavedDraft(null);
  }

  function validateRoster(): boolean {
    if (name.trim().length === 0) {
      setNameError("Enter a parlay name before continuing.");
      return false;
    }

    setNameError(null);
    setRosterError(null);
    return true;
  }

  function validateFirstLeg(): boolean {
    if (!selectedMarket) {
      setFirstLegError("Choose a market to seed leg 1.");
      return false;
    }

    if (selectedOutcomeIndex === null) {
      setFirstLegError("Choose an outcome before committing shares.");
      return false;
    }

    if (selectedCommitmentEntries.length === 0) {
      setFirstLegError("Commit at least one eligible lot to seed leg 1.");
      return false;
    }

    for (const [positionId, shares] of selectedCommitmentEntries) {
      const lot = eligibleLots.find((candidate) => candidate.positionId === positionId);
      if (!lot) {
        setFirstLegError("One of the selected lots is no longer eligible.");
        return false;
      }

      if (Number(shares) > Number(lot.availableShares)) {
        setFirstLegError(
          `Lot ${lot.positionId} only has ${lot.availableShares} available shares.`
        );
        return false;
      }
    }

    setFirstLegError(null);
    return true;
  }

  async function submitParlay() {
    if (!validateFirstLeg() || !selectedMarket || selectedOutcomeIndex === null) {
      return;
    }

    setIsSubmitting(true);
    setFirstLegError(null);

    try {
      let nextDraftId = draftId;

      if (!nextDraftId) {
        const createParlayResponse = await fetch("/api/parlays", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            inviteUserIds: selectedMembers.map((member) => member.id)
          })
        });

        const createParlayBody = (await createParlayResponse.json().catch(() => undefined)) as
          | { parlay?: { id?: string } }
          | { error?: { code?: string } }
          | undefined;

        const createdParlayId = getCreatedParlayId(createParlayBody);

        if (!createParlayResponse.ok || !createdParlayId) {
          setConfirmOpen(false);
          setRosterError(getDraftErrorMessage(createParlayBody));
          setStep("roster");
          return;
        }

        nextDraftId = createdParlayId;
        setDraftId(nextDraftId);
        persistDraft({
          id: nextDraftId,
          name: name.trim(),
          invitees: selectedMembers
        });
      }

      const createLegResponse = await fetch(`/api/parlays/${nextDraftId}/legs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          marketId: selectedMarket.gammaId,
          outcomeIndex: selectedOutcomeIndex,
          commitments: selectedCommitmentEntries.map(([positionId, shares]) => ({
            positionId,
            shares
          }))
        })
      });

      const createLegBody = (await createLegResponse.json().catch(() => undefined)) as
        | { error?: { code?: string } }
        | undefined;

      if (!createLegResponse.ok) {
        setFirstLegError(getLegErrorMessage(createLegBody?.error?.code));
        return;
      }

      clearSavedDraft();
      setDraftId(null);
      setConfirmOpen(false);
      router.push("/parlays");
      router.refresh();
    } catch {
      setFirstLegError("The first leg could not be created. Your draft is saved so you can retry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Create parlay</h1>
        <p className="text-slate-600">
          Lock the roster first, then create leg 1 by committing already-purchased shares.
        </p>
      </div>

      {savedDraft && !draftId ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Saved draft found: {savedDraft.name}</p>
          <p className="mt-1">
            Leg 1 was not finished yet. You can resume this hidden draft and keep it out of active discovery until the first leg succeeds.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              className="rounded-md bg-slate-950 px-3 py-2 font-medium text-white"
              onClick={() => {
                setName(savedDraft.name);
                setSelectedMembers(savedDraft.invitees);
                setDraftId(savedDraft.id);
                setStep("first-leg");
              }}
              type="button"
            >
              Resume saved draft
            </button>
            <button
              className="rounded-md border border-amber-300 bg-white px-3 py-2 font-medium text-slate-700"
              onClick={clearSavedDraft}
              type="button"
            >
              Dismiss reminder
            </button>
          </div>
        </div>
      ) : null}

      <WizardStepIndicator currentStep={step} />

      {step === "roster" ? (
        <div className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            You will be added automatically as the creator. Search results show usernames, but the roster is submitted using stable user IDs.
          </div>

          <ParlayRosterStep
            disabled={isSubmitting}
            name={name}
            nameError={nameError}
            onAddMember={(user) => {
              setSelectedMembers((current) =>
                current.some((member) => member.id === user.id)
                  ? current
                  : [...current, { id: user.id, username: user.username }]
              );
              setSearchQuery("");
              setSearchResults([]);
            }}
            onNameChange={setName}
            onRemoveMember={(userId) =>
              setSelectedMembers((current) => current.filter((member) => member.id !== userId))
            }
            onSearchQueryChange={setSearchQuery}
            rosterError={
              searchStatus === "error"
                ? "Users could not be loaded right now."
                : rosterError
            }
            searchQuery={searchQuery}
            searchResults={searchResults}
            selectedMembers={selectedMembers}
          />

          <div className="flex justify-end">
            <button
              className="min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitting}
              onClick={() => {
                if (validateRoster()) {
                  setStep("first-leg");
                }
              }}
              type="button"
            >
              Continue to first leg
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="text-sm font-semibold text-slate-500">Step 2 of 2</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">First leg</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Choose the market and outcome, then lock existing shares from eligible lots.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-medium text-slate-950">{name || "Untitled parlay"}</p>
              <p className="mt-1">
                Locked roster: {currentUser.username}
                {selectedMembers.length > 0
                  ? `, ${selectedMembers.map((member) => member.username).join(", ")}`
                  : " (creator only)"}
              </p>
            </div>
          </div>

          <section className="space-y-4">
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-max gap-2" aria-label="Market categories">
                {MARKET_CATEGORIES.map((category) => (
                  <button
                    aria-pressed={selectedCategory === category}
                    className={cn(
                      "min-h-11 rounded-md border px-3 py-2 text-sm font-medium transition",
                      selectedCategory === category
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                    )}
                    disabled={isSubmitting}
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    type="button"
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {marketStatus === "loading" ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Loading markets…
              </div>
            ) : null}

            {marketStatus === "error" ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                Markets could not be loaded right now.
              </p>
            ) : null}

            {marketStatus === "success" && events.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                No cached {selectedCategory} events are available yet.
              </div>
            ) : null}

            {marketStatus === "success" && events.length > 0 ? (
              <div className="space-y-3">
                {events.map((event) => (
                  <article className="rounded-md border border-slate-200" key={event.gammaId}>
                    <div className="border-b border-slate-200 px-4 py-3">
                      <h3 className="font-medium text-slate-950">{event.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Volume {event.volume} · Synced {formatDateTime(event.lastSyncedAt)}
                      </p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {event.markets.map((market) => {
                        const selected = selectedMarket?.gammaId === market.gammaId;
                        const unavailable = market.closed || !market.active || market.bestAsk === null;

                        return (
                          <div
                            className={cn(
                              "grid gap-3 px-4 py-4 lg:grid-cols-[1fr_auto] lg:items-center",
                              selected && "bg-slate-50"
                            )}
                            key={market.gammaId}
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-slate-950">{market.question}</p>
                                {market.closed ? (
                                  <span className="rounded-sm bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                                    Closed
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-2 text-sm text-slate-600">
                                {market.outcomes.map((outcome, index) => (
                                  <span key={`${market.gammaId}-${outcome}`} className="mr-3 inline-block">
                                    {outcome} {formatPercent(market.outcomePrices[index])}
                                  </span>
                                ))}
                              </p>
                              <p className="mt-2 text-xs text-slate-500">
                                Buy at {market.bestAsk ?? "n/a"} · Sell at {market.bestBid ?? "n/a"} · Resolves{" "}
                                {formatDate(market.endDate)}
                              </p>
                            </div>
                            <button
                              className="min-h-11 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isSubmitting || unavailable}
                              onClick={() => {
                                setSelectedMarket(market);
                                setSelectedOutcomeIndex(market.outcomes.length === 2 ? 0 : null);
                                setFirstLegError(null);
                              }}
                              type="button"
                            >
                              {selected ? "Selected" : "Choose market"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-slate-950">Outcome</h3>
              <p className="mt-1 text-sm text-slate-600">
                Choose the same outcome you already hold in your portfolio.
              </p>
            </div>

            {selectedMarket ? (
              <div
                aria-label="Outcome"
                className={selectedMarket.outcomes.length === 2 ? "grid grid-cols-2 gap-2" : "space-y-2"}
                role="group"
              >
                {selectedMarket.outcomes.map((outcome, index) => (
                  <button
                    aria-pressed={selectedOutcomeIndex === index}
                    className={cn(
                      "min-h-11 rounded-md border px-3 py-2 text-sm font-medium transition",
                      selectedOutcomeIndex === index
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                    )}
                    disabled={isSubmitting}
                    key={`${selectedMarket.gammaId}-${outcome}`}
                    onClick={() => {
                      setSelectedOutcomeIndex(index);
                      setFirstLegError(null);
                    }}
                    type="button"
                  >
                    {outcome} · {formatPercent(selectedMarket.outcomePrices[index])}
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                Choose a market above before picking the outcome.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-slate-950">Eligible lots</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Only open lots on the selected outcome with available shares can be committed.
                </p>
              </div>
              <div className="text-sm text-slate-500">
                {eligibleLots.length} eligible lot{eligibleLots.length === 1 ? "" : "s"}
              </div>
            </div>

            {selectedMarket && selectedOutcomeIndex !== null && eligibleLots.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                <p>No eligible open lots are available for this outcome.</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <Link className="font-medium text-primary underline" href="/markets">
                    Buy a position
                  </Link>
                  <Link className="font-medium text-primary underline" href="/portfolio">
                    Review your portfolio
                  </Link>
                </div>
              </div>
            ) : (
              <EligiblePositionCommitSelector
                disabled={isSubmitting}
                errorMessage={firstLegError}
                lots={eligibleLots}
                onCommitmentChange={(positionId, shares) =>
                  setSelectedCommitments((current) => ({
                    ...current,
                    [positionId]: shares
                  }))
                }
                selectedCommitments={selectedCommitments}
              />
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-3">
              {!draftId ? (
                <button
                  className="min-h-11 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                  disabled={isSubmitting}
                  onClick={() => setStep("roster")}
                  type="button"
                >
                  Back
                </button>
              ) : null}
              {draftId ? (
                <Link
                  className="inline-flex min-h-11 items-center rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                  href="/parlays"
                >
                  Leave draft for later
                </Link>
              ) : null}
            </div>

            <button
              className="min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitting}
              onClick={() => {
                if (validateFirstLeg()) {
                  setConfirmOpen(true);
                }
              }}
              type="button"
            >
              {isSubmitting ? "Creating parlay…" : "Create parlay"}
            </button>
          </div>
        </div>
      )}

      <ParlayCommitConfirmDialog
        cancelLabel="Cancel"
        commitmentSummary={`Commit ${formatShares(selectedCommitmentSummary.totalShares)} shares across ${selectedCommitmentSummary.lots} lot${selectedCommitmentSummary.lots === 1 ? "" : "s"} into ${selectedMarket?.question ?? "the selected market"}${selectedOutcomeIndex !== null && selectedMarket ? ` (${selectedMarket.outcomes[selectedOutcomeIndex]})` : ""}.`}
        confirmLabel={draftId ? "Finish activating parlay" : "Create parlay"}
        errorMessage={firstLegError}
        houseRiskCopy="If an earlier leg fails before this one is reached, this commitment is lost to HOUSE."
        lockedWarning="These shares will be locked into this parlay as soon as leg 1 is created."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await submitParlay();
        }}
        open={confirmOpen}
        pending={isSubmitting}
        title="Commit shares to leg 1?"
      >
        <div className="space-y-2 text-sm text-slate-700">
          <p>
            <span className="font-medium text-slate-950">Parlay:</span> {name || "Untitled parlay"}
          </p>
          <p>
            <span className="font-medium text-slate-950">Roster:</span> {currentUser.username}
            {selectedMembers.length > 0
              ? `, ${selectedMembers.map((member) => member.username).join(", ")}`
              : " (creator only)"}
          </p>
        </div>
      </ParlayCommitConfirmDialog>
    </section>
  );
}

function getDraftErrorMessage(
  body: { error?: { code?: string } } | { parlay?: { id?: string } } | undefined
): string {
  if (body && "error" in body) {
    const code = body.error?.code;
    if (code === "INVITEE_NOT_FOUND") {
      return "One of the selected members no longer exists. Refresh the roster and try again.";
    }
    if (code === "INVALID_NAME" || code === "PARLAY_NAME_REQUIRED") {
      return "Enter a parlay name before continuing.";
    }
  }

  return "The draft parlay could not be created.";
}

function getCreatedParlayId(
  body: { error?: { code?: string } } | { parlay?: { id?: string } } | undefined
): string | null {
  if (body && "parlay" in body && typeof body.parlay?.id === "string") {
    return body.parlay.id;
  }

  return null;
}

function getLegErrorMessage(errorCode?: string): string {
  if (
    errorCode === "INSUFFICIENT_AVAILABLE_SHARES" ||
    errorCode === "COMMITMENT_EXCEEDS_AVAILABLE_SHARES"
  ) {
    return "One of the selected commitments exceeds the shares still available in that lot.";
  }

  if (
    errorCode === "POSITION_GROUP_NOT_FOUND" ||
    errorCode === "POSITION_WRONG_OUTCOME" ||
    errorCode === "COMMITMENT_MARKET_MISMATCH"
  ) {
    return "The selected lots no longer match the chosen market and outcome.";
  }

  if (errorCode === "POSITION_CONFLICT") {
    return "Those shares changed before the leg could be created. Review the lots and retry.";
  }

  if (errorCode === "NO_COMMITMENTS") {
    return "Commit at least one eligible lot to seed leg 1.";
  }

  return "The first leg could not be created. Your draft is saved so you can retry.";
}

function formatPercent(value: string | undefined): string {
  if (!value) {
    return "n/a";
  }

  const [integerPart, fractionPart = ""] = value.split(".");
  const scaled = `${integerPart}${fractionPart.padEnd(2, "0").slice(0, 2)}`;
  const percent = scaled.replace(/^0+(?=\d)/, "") || "0";
  return `${percent}%`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShares(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}
