import React, { useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { formatPoints } from "@/lib/money";

export type MemberVoteTally = {
  totalMemberStake: string;
  yesStake: string;
  members: Array<{
    userId: string;
    username: string;
    amount: string;
    sharePct: number;
    votingYes: boolean;
  }>;
} | null;

type RolloverControlProps = {
  parlayId: string;
  legId: string;
  currentUserId: string;
  memberVoteTally: MemberVoteTally;
  callerStake: {
    amount: string;
    shares: string;
    status: string;
  } | null;
  currentLegMarket: {
    bestBid: string | null;
  };
  nextLegMarket: {
    bestAsk: string | null;
  } | null;
  isFinalLeg: boolean;
  onVoted?: () => void;
};

export function RolloverControl({
  parlayId,
  legId,
  currentUserId,
  memberVoteTally,
  callerStake,
  currentLegMarket,
  nextLegMarket,
  isFinalLeg,
  onVoted
}: RolloverControlProps) {
  if (isFinalLeg || !memberVoteTally) {
    return null;
  }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const reasonId = useId();
  const errorId = useId();

  const percentage =
    Number(memberVoteTally.totalMemberStake) > 0
      ? Math.round((Number(memberVoteTally.yesStake) / Number(memberVoteTally.totalMemberStake)) * 100)
      : 0;
  const callerMember = memberVoteTally.members.find((member) => member.userId === currentUserId) ?? null;
  const canVote = callerMember !== null && callerStake?.status === "ACTIVE";
  const describedBy = [!canVote ? reasonId : null, errorMessage ? errorId : null]
    .filter(Boolean)
    .join(" ");
  const currentYesStake = Number(memberVoteTally.yesStake);
  const callerStakeAmount = Number(callerMember?.amount ?? "0");
  const callerSharePct = Math.round((callerMember?.sharePct ?? 0) * 100);
  const voteWouldBeDecisive =
    callerMember !== null &&
    !callerMember.votingYes &&
    callerStakeAmount + currentYesStake > Number(memberVoteTally.totalMemberStake) * 0.5;
  const stopLossPreview = useMemo(() => {
    const bestBid = currentLegMarket.bestBid ? Number(currentLegMarket.bestBid) : null;
    const bestAsk = nextLegMarket?.bestAsk ? Number(nextLegMarket.bestAsk) : null;
    const shares = callerStake?.shares ? Number(callerStake.shares) : null;
    if (!bestBid || !bestAsk || !shares || bestAsk <= 0) {
      return null;
    }

    return {
      bestBid,
      bestAsk,
      resultingShares: (shares * bestBid) / bestAsk
    };
  }, [callerStake?.shares, currentLegMarket.bestBid, nextLegMarket?.bestAsk]);

  async function submitVote(vote: boolean) {
    setPending(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/parlays/${parlayId}/legs/${legId}/rollover-vote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vote })
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: { code?: string } };
        setErrorMessage(getVoteErrorMessage(body.error?.code));
        return;
      }

      setDialogOpen(false);
      onVoted?.();
    } catch {
      setErrorMessage("The rollover vote could not be saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-md border border-slate-200 p-3 text-sm">
      <p aria-live="polite" className="font-medium text-slate-900">
        {percentage}% of member stake voting to roll over — need &gt;50%
      </p>
      <ul className="mt-2 flex flex-col gap-2 text-slate-600">
        {memberVoteTally.members.map((member) => (
          <li
            key={member.userId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="font-medium text-slate-900">{member.username}</p>
              <p className="text-xs text-slate-500">
                {Math.round(member.sharePct * 100)}% of member stake
              </p>
            </div>

            {member.userId === currentUserId ? (
              <button
                type="button"
                role="switch"
                aria-checked={member.votingYes}
                aria-label="Vote to roll over"
                aria-describedby={describedBy || undefined}
                disabled={pending}
                onClick={() => {
                  if (member.votingYes) {
                    void submitVote(false);
                    return;
                  }
                  setDialogOpen(true);
                  setErrorMessage(null);
                }}
                className={cn(
                  "min-h-11 rounded-full border px-4 py-2 font-medium transition",
                  member.votingYes
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-slate-300 bg-white text-slate-700",
                  pending && "cursor-not-allowed opacity-60"
                )}
              >
                {member.votingYes ? "Voting yes" : "Vote to roll over"}
              </button>
            ) : (
              <span className="text-sm font-medium text-slate-700">
                {member.votingYes ? "Voting yes" : "Not voting"}
              </span>
            )}
          </li>
        ))}
      </ul>

      {!canVote ? (
        <div className="mt-3 rounded-md border border-slate-100 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-slate-900">Your vote</p>
              <p id={reasonId} className="text-xs text-slate-500">
                Only formal members with stake on this leg can vote to roll over.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked="false"
              aria-disabled="true"
              aria-describedby={`${reasonId}${errorMessage ? ` ${errorId}` : ""}`}
              className="min-h-11 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 font-medium text-slate-400"
            >
              Vote to roll over
            </button>
          </div>
        </div>
      ) : null}

      {errorMessage && !dialogOpen ? (
        <p id={errorId} role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <RolloverVoteDialog
        open={dialogOpen}
        pending={pending}
        errorMessage={errorMessage}
        message={
          voteWouldBeDecisive
            ? "Your vote alone will trigger this rollover for the entire leg, including other members' and backers' stakes."
            : `Add your vote (${callerSharePct}% of member stake) toward the 50% needed?`
        }
        stopLossPreview={stopLossPreview}
        onCancel={() => {
          if (pending) return;
          setDialogOpen(false);
        }}
        onConfirm={() => void submitVote(true)}
      />
    </div>
  );
}

function getVoteErrorMessage(code?: string) {
  switch (code) {
    case "NOT_A_VOTING_MEMBER":
      return "Only formal members with stake on this leg can vote to roll over.";
    case "LEG_NOT_ACTIVE":
    case "PARLAY_NOT_ACTIVE":
      return "This leg is no longer active, so the rollover vote could not be changed.";
    case "PRICE_UNAVAILABLE":
      return "Current prices are unavailable, so this rollover cannot execute right now.";
    default:
      return "The rollover vote could not be saved. Try again.";
  }
}

function RolloverVoteDialog({
  open,
  pending,
  errorMessage,
  message,
  stopLossPreview,
  onCancel,
  onConfirm
}: {
  open: boolean;
  pending: boolean;
  errorMessage: string | null;
  message: string;
  stopLossPreview: {
    bestBid: number;
    bestAsk: number;
    resultingShares: number;
  } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement | null;
      cancelRef.current?.focus();
    } else if (previousActiveElement.current) {
      previousActiveElement.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
        return;
      }

      if (event.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm rollover vote"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-slate-950">Confirm rollover vote</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>

        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-950">Stop-loss preview</p>
          {stopLossPreview ? (
            <div className="mt-2 grid gap-2 text-sm text-amber-950 sm:grid-cols-3">
              <p>
                Exit at bestBid
                <br />
                <strong>{formatPoints(stopLossPreview.bestBid)}</strong>
              </p>
              <p>
                Enter next leg at bestAsk
                <br />
                <strong>{formatPoints(stopLossPreview.bestAsk)}</strong>
              </p>
              <p>
                Resulting shares
                <br />
                <strong>{formatPoints(stopLossPreview.resultingShares)}</strong>
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-amber-950">
              Current stop-loss preview is unavailable until both market prices sync.
            </p>
          )}
        </div>

        {errorMessage ? (
          <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className={cn(
              "min-h-11 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700",
              "hover:border-slate-400",
              pending && "cursor-not-allowed opacity-60"
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cn(
              "min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white",
              "hover:bg-slate-800",
              pending && "cursor-not-allowed opacity-60"
            )}
          >
            {pending ? "Saving…" : "Confirm vote"}
          </button>
        </div>
      </div>
    </div>
  );
}
