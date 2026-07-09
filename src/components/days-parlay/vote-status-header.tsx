import React from "react";

export type VoteStatusHeaderMyVote = {
  legId: string;
  marketQuestion: string;
} | null;

type VoteStatusHeaderProps = {
  myVote: VoteStatusHeaderMyVote;
  // 1-based position of `myVote`'s leg within the day's chain, e.g. "Leg 3".
  // Only meaningful (and required) when `myVote` is non-null.
  legNumber?: number | null;
};

// Always-visible, page-level (not per-leg) vote status (PRD Part II §2.4,
// item 1 / Part IV §4.4) — a backer has exactly one rollover vote to spend
// across the *entire* day's chain, so this needs to be legible from
// anywhere on the page, not just from the leg currently in view.
export function VoteStatusHeader({ myVote, legNumber }: VoteStatusHeaderProps) {
  return (
    <div
      data-testid="vote-status-header"
      role="status"
      className="sticky top-0 z-10 rounded-md border border-slate-200 bg-white/95 px-4 py-3 text-sm shadow-sm backdrop-blur"
    >
      {myVote ? (
        <p className="font-medium text-slate-900">
          Your vote: spent on Leg {legNumber ?? "?"}: {myVote.marketQuestion}{" "}
          <a href={`#leg-${myVote.legId}`} className="underline">
            Jump to leg
          </a>
        </p>
      ) : (
        <p className="font-medium text-slate-900">Your vote: unspent</p>
      )}
    </div>
  );
}
