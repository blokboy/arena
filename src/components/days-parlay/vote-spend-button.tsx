import React, { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { formatPoints } from "@/lib/money";

type VoteSpendButtonProps = {
  legId: string;
  currentLegMarket: {
    bestBid: string | null;
  };
  nextLegMarket: {
    bestAsk: string | null;
  } | null;
  callerShares: string | null;
  onCommitted: () => void;
};

// Day's Parlay's one-shot rollover vote-spend action (PRD Part II §2.4, Part
// IV §4.4). Explicitly its own component, NOT a mode of `RolloverControl`
// (src/components/parlays/rollover-control.tsx) or a shared dialog with it —
// the interaction shape genuinely differs: a one-shot confirm dialog
// spending the backer's *only* vote for the entire day, versus that
// component's freely-reversible per-leg toggle.
export function VoteSpendButton({
  legId,
  currentLegMarket,
  nextLegMarket,
  callerShares,
  onCommitted
}: VoteSpendButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const stopLossPreview = useMemo(() => {
    const bestBid = currentLegMarket.bestBid ? Number(currentLegMarket.bestBid) : null;
    const bestAsk = nextLegMarket?.bestAsk ? Number(nextLegMarket.bestAsk) : null;
    const shares = callerShares ? Number(callerShares) : null;
    if (!bestBid || !bestAsk || !shares || bestAsk <= 0) {
      return null;
    }

    return {
      bestBid,
      bestAsk,
      resultingShares: (shares * bestBid) / bestAsk
    };
  }, [callerShares, currentLegMarket.bestBid, nextLegMarket?.bestAsk]);

  async function submitVote() {
    setPending(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/days-parlay/legs/${legId}/rollover-vote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vote: true })
      });

      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { code?: string; details?: Record<string, unknown> };
        };
        setErrorMessage(getVoteSpendErrorMessage(body.error?.code));
        return;
      }

      setDialogOpen(false);
      onCommitted();
    } catch {
      setErrorMessage("Your rollover vote could not be saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setErrorMessage(null);
          setDialogOpen(true);
        }}
        className="min-h-11 self-start rounded-md border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-900 hover:border-violet-400"
      >
        Spend your rollover vote on this leg
      </button>

      {errorMessage && !dialogOpen ? (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <VoteSpendDialog
        open={dialogOpen}
        pending={pending}
        errorMessage={errorMessage}
        stopLossPreview={stopLossPreview}
        returnFocusRef={triggerRef}
        onCancel={() => {
          if (pending) return;
          setDialogOpen(false);
        }}
        onConfirm={() => void submitVote()}
      />
    </>
  );
}

export function getVoteSpendErrorMessage(code?: string): string {
  switch (code) {
    case "ROLLOVER_CAP_REACHED":
      return "Today's rollover cap (3 per day) has already been reached, so this vote can no longer trigger a rollover.";
    case "VOTE_ALREADY_SPENT":
      return "You've already spent today's one rollover vote on another leg.";
    case "LEG_NOT_ACTIVE":
      return "This leg is no longer active, so your vote could not be cast here.";
    case "BACKER_REQUIRED":
      return "Only backers who staked into this leg can vote here.";
    case "FINAL_LEG_NOT_ROLLOVERABLE":
      return "The final leg has no next leg to roll into, so it can't be rolled over.";
    case "PARLAY_NOT_ACTIVE":
      return "This Day's Parlay is no longer active, so your vote could not be cast.";
    default:
      return "Your rollover vote could not be saved. Try again.";
  }
}

function VoteSpendDialog({
  open,
  pending,
  errorMessage,
  stopLossPreview,
  returnFocusRef,
  onCancel,
  onConfirm
}: {
  open: boolean;
  pending: boolean;
  errorMessage: string | null;
  stopLossPreview: {
    bestBid: number;
    bestAsk: number;
    resultingShares: number;
  } | null;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Same focus-trap / Escape / return-focus pattern as
  // `RolloverVoteDialog` in rollover-control.tsx (reused deliberately, not
  // reinvented — PRD Part II §4 accessibility flag #3), reimplemented here
  // rather than imported because this is intentionally its own component
  // (see module doc comment above).
  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
    } else {
      returnFocusRef.current?.focus();
    }
  }, [open, returnFocusRef]);

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
      aria-label="Spend your rollover vote"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-slate-950">Spend your rollover vote</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Spend your one rollover vote on this leg? You won&apos;t be able to vote on any other leg
          today.
        </p>

        <div className="mt-4 rounded-lg border border-violet-300 bg-violet-50 px-4 py-3">
          <p className="text-sm font-semibold text-violet-950">Stop-loss preview</p>
          {stopLossPreview ? (
            <div className="mt-2 grid gap-2 text-sm text-violet-950 sm:grid-cols-3">
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
            <p className="mt-2 text-sm text-violet-950">
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
              "min-h-11 rounded-md bg-violet-700 px-4 py-2 text-sm font-medium text-white",
              "hover:bg-violet-800",
              pending && "cursor-not-allowed opacity-60"
            )}
          >
            {pending ? "Saving…" : "Spend vote"}
          </button>
        </div>
      </div>
    </div>
  );
}
