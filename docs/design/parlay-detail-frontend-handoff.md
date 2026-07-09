# Parlay Detail Frontend Handoff

Issue #9: Append and back regular parlay legs end to end.

This page is the frontend pickup note for the regular-parlay detail screen. It assumes the backend contracts from the PRD are available and focuses on wiring the UI to them.

## Scope

- Regular parlay detail only.
- Extend the existing app shell and visual system already established in the repo.
- Do not invent new design language. Apply the PRD wireframe rules to real components.

## Required UI Pieces

### 1. `LegStatusBadge`

Statuses:

- `PENDING` -> `Pending, locked`
- `ACTIVE` -> `Live`
- `RESOLVED_WON` -> `Won`
- `RESOLVED_LOST` -> `Lost`
- `ROLLED_OVER` -> `Rolled over`
- `VOIDED` -> `Voided, refunded`

Rules:

- Never rely on color alone.
- Pair each state with an icon and/or distinct badge shape.
- `ACTIVE` is the only state with motion/pulse, and it must respect `prefers-reduced-motion`.
- Confirm contrast for live blue and pending/voided against light and dark themes.

### 2. `LegTimeline`

Layout:

- Vertical timeline.
- Fixed left rail for date + badge.
- DOM order must match server order.
- Render legs in the order returned by the API.
- Do not client-sort.
- Each row should have an anchor id like `leg-{legId}`.
- The active leg should have a sticky “you are here” marker that remains visible while scrolling.

Each row should show:

- Date/time.
- Status badge.
- Market question and outcome.
- Backer summary.
- Relevant prices.
- Any inline warnings or notes.

### 3. `RolloverControl`

Use one shared visual shape for regular parlays, but keep the rules regular-parlay specific here.

Rules:

- Show stake-weighted member vote tally.
- Non-member backers see the tally read-only.
- Members who are not on the leg also see read-only state.
- The control should disappear only on the final leg.
- The tally text must be `aria-live="polite"`.
- If a single member vote would cross 50%, the confirmation copy must say so plainly.
- Stop-loss preview belongs inside the confirmation dialog, not as a separate control.

### 4. Append / Back Forms

The same locked-share flow should power both append and back actions.

Rules:

- Append is member-only.
- Backing the active leg is available to authenticated users, but non-members do not gain vote rights.
- Keep the control visible for non-members if applicable, but disable it with a visible reason.
- Confirmation text must warn that shares lock immediately and can be lost to HOUSE if an earlier leg fails before the leg is reached.
- Rejections should appear inline at the point of entry, not only as a toast.
- Append-too-early should show the conflicting date.
- Commit rows and buttons need hit targets of at least 44x44px.

## Screen Behavior

- The regular parlay detail page should show:
  - parlay name
  - member count / roster
  - current active leg summary
  - append action for members
  - back action for the active leg
  - the leg timeline
  - backer list / stake amounts
  - accessible status badges
  - active-leg marker
  - locked-share / HOUSE-loss warning copy

- There is no early cash-out control anywhere in the parlay UI.
- Keep append/back controls visually separate from single-market sell language and styling.
- The timeline must feel data-dense and compact, not like a marketing page.

## Suggested Data Contract

Frontend should expect `GET /api/parlays/:id` to provide:

```ts
type ParlayDetailResponse = {
  id: string;
  name: string;
  kind: "REGULAR";
  status: "DRAFT" | "ACTIVE" | "SUCCEEDED" | "FAILED" | "VOIDED";
  members: Array<{ userId: string; username: string }>;
  currentActiveLegId: string | null;
  legs: Array<{
    id: string;
    marketId: string;
    outcomeIndex: number;
    status: "PENDING" | "ACTIVE" | "RESOLVED_WON" | "RESOLVED_LOST" | "ROLLED_OVER" | "VOIDED";
    claimedByUsername?: string | null;
    executedAt?: string | null;
    resolvedOutcomeIndex?: number | null;
    market: {
      gammaId: string;
      question: string;
      endDate: string;
      lastSyncedAt?: string;
      bestBid?: string | null;
      bestAsk?: string | null;
    };
    stakes: Array<{
      userId: string;
      username: string;
      amount: string;
      shares: string;
      averageEntryPrice: string;
      status: "PENDING" | "ACTIVE" | "RESOLVED_WON" | "RESOLVED_LOST" | "ROLLED_OVER" | "VOIDED_REFUNDED";
    }>;
    memberVoteTally?: null | {
      totalMemberStake: string;
      yesStake: string;
      members: Array<{
        userId: string;
        username: string;
        amount: string;
        sharePct: number;
        votingYes: boolean;
      }>;
    };
  }>;
  myMembership: {
    isMember: boolean;
    isBackerOnActiveLeg: boolean;
  };
};
```

## Acceptance Bar

- Status never depends on color alone.
- `ACTIVE` has a distinct live treatment.
- Timeline order matches the server.
- Sticky active marker remains visible while scrolling.
- Append/back confirmations clearly communicate locked-share risk.
- Non-member unavailable actions stay visible with a reason.
- Dense rows keep accessible hit targets.

