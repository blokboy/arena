# Leaderboard Component Implementation Hand Off

Issue: `#7` - `Show leaderboard with active-user MEAN`

Scope: frontend implementation for the leaderboard page in `blokboy/arena`, based on:

- PRD: [`docs/prds/points-prediction-market.md`](../prds/points-prediction-market.md)
- Wireframes: [`docs/design/points-prediction-market-wireframes.md`](points-prediction-market-wireframes.md)
- Domain terminology: [`CONTEXT.md`](../../CONTEXT.md)
- Issue: GitHub issue `#7`

This handoff is focused on the leaderboard page only. It does not redefine backend behavior. The backend/domain shape already exists in:

- [`src/domain/leaderboard.ts`](../../src/domain/leaderboard.ts)
- [`tests/unit/leaderboard.test.ts`](../../tests/unit/leaderboard.test.ts)

## Product requirements

The leaderboard page must show:

- A ranked table of real users ordered by balance.
- A synthetic `MEAN` row inserted client-side at the numerically correct position.
- A visual distinction for the current user row.
- A separate random-parlays discovery module below the table.
- No time-range filter or leaderboard mode switch.

Hard rule: `MEAN` is not a real account and must never be presented as one.

## Component implementation

The frontend engineer should implement this page as a small composition of page, table, row, and discovery components. Keep the data transformation close to the page boundary and keep row rendering dumb.

### 1. `LeaderboardPage`

Location: `src/app/(app)/leaderboard/page.tsx`

Responsibilities:

- Fetch or receive the leaderboard payload.
- Compute the rendered rows array by inserting `MEAN` client-side.
- Pass the current user identity into the table for highlight logic.
- Render the random-parlays section underneath the table.

Suggested props / inputs:

```ts
type LeaderboardPageProps = {
  currentUserId: string;
  leaderboard: {
    rows: Array<{
      rank: number;
      username: string;
      balance: number;
    }>;
    mean: number | null;
  };
  randomParlays: Array<ParlayCardView>;
};
```

Behavior:

- If `mean` is `null`, do not render a MEAN row.
- Insert MEAN into the row list before rendering, based on balance value.
- Keep real rows untouched.
- Do not derive a synthetic rank from the API. The rank comes from the final rendered order.

### 2. `LeaderboardTable`

Purpose:

- Own the semantic `<table>` markup.
- Own the accessible caption.
- Render all rows, including the inserted MEAN row.

Required structure:

- `Table`
- `TableCaption`
- `TableHeader`
- `TableBody`

Recommended caption text:

```text
All-time leaderboard. MEAN is the live average balance across active users and is not a real account.
```

Required columns:

- Rank
- Player
- Balance

Behavior:

- Use a real table, not div-based layout.
- Keep the table the visual primary on the page.
- Allow the table to accept an already-prepared row list instead of doing API parsing inside the component.

Suggested props:

```ts
type LeaderboardTableProps = {
  rows: LeaderboardRenderRow[];
  currentUserId: string;
};
```

### 3. `LeaderboardRow`

Purpose:

- Render a single row for either a real user or MEAN.
- Apply row-specific styling and badges.

Suggested row model:

```ts
type LeaderboardRenderRow =
  | {
      kind: "user";
      id: string;
      rank: number;
      username: string;
      balance: number;
    }
  | {
      kind: "mean";
      rank: number;
      username: "MEAN";
      balance: number;
    };
```

Required behavior:

- Real user rows show rank, username, and balance.
- MEAN row shows a small `MEAN` badge.
- MEAN row uses a muted neutral tint.
- Current user rows use a left-border accent.
- Current user styling must not rely on color alone if a `You` label fits in the username cell.

Recommended styling rules:

- MEAN row:
  - muted background tint
  - small badge
  - no special border treatment
- current user row:
  - `border-l-2` or `border-l-4`
  - neutral or cool accent
  - optional `You` pill or text label

Accessibility:

- The row should remain readable as a table row for screen readers.
- MEAN should still be distinguishable from a real account when read in the table.

### 4. `MeanRow`

Purpose:

- A thin wrapper or row variant for the synthetic MEAN entry.

Required copy:

- Badge label: `MEAN`
- Tooltip / caption: `Live average balance across all users — not a real account.`

Behavior:

- Do not make MEAN appear clickable.
- Do not add navigation, action menus, or account affordances.
- Keep it visually distinct but low-emphasis.

### 5. `CurrentUserHighlight`

Purpose:

- Encapsulate the current-user visual treatment so it can be reused without coupling it to MEAN styling.

Recommended behavior:

- Add a left border to the row.
- Optionally add a small `You` label in the username cell.
- Use a subtle accent that is not used anywhere for status semantics.

Suggested contract:

```ts
type CurrentUserHighlightProps = {
  isCurrentUser: boolean;
  children: React.ReactNode;
};
```

### 6. `RandomParlaysSection`

Purpose:

- Render the non-ranking discovery content below the leaderboard.

Placement:

- Below the leaderboard table.
- Never beside it.

Suggested props:

```ts
type RandomParlaysSectionProps = {
  parlays: Array<ParlayCardView>;
};
```

Behavior:

- Render a section heading: `Random parlays`
- Render exactly three cards when the API returns three items.
- Keep this section visually subordinate to the leaderboard.
- No rank numbers.
- No MEAN treatment.

### 7. `ParlayCard`

Purpose:

- A compact discovery card for a random existing parlay.

If this component does not already exist elsewhere, define its first version here as a low-emphasis card.

Suggested visible fields:

- parlay name
- member count or backer count, depending on available data
- active leg summary
- chain length
- one primary action, such as `Open`

Treatment:

- Smaller visual weight than leaderboard rows.
- No large badges.
- No hero treatment.
- No status colors that compete with leaderboard semantics.

### 8. `LeaderboardEmptyState`

Purpose:

- Handle the rare case where the leaderboard payload has no rows or MEAN is unavailable.

Behavior:

- Keep it inline and minimal.
- Do not introduce a separate marketing-style empty illustration.
- Preserve the same page layout so the random-parlays module can still render.

## Data contract reminder

The frontend should expect the leaderboard API shape described in the PRD:

```ts
{
  rows: Array<{
    rank: number;
    username: string;
    balance: number;
  }>;
  mean: number | null;
}
```

Frontend responsibility:

- Sort/integrate the synthetic MEAN row client-side.
- Preserve the real rows as-is.
- Render `MEAN` separately from real users.
- Keep the random-parlays module visually separate from the table.

## Implementation notes

- The current leaderboard page is still a stub in `src/app/(app)/leaderboard/page.tsx`.
- The domain helper already computes active-user MEAN correctly in [`src/domain/leaderboard.ts`](../../src/domain/leaderboard.ts).
- Tests already cover the active-user mean behavior in [`tests/unit/leaderboard.test.ts`](../../tests/unit/leaderboard.test.ts).

Recommended frontend sequence:

1. Build the semantic table shell and caption.
2. Add the row model and client-side MEAN insertion.
3. Implement `LeaderboardRow` and `MeanRow`.
4. Add current-user highlighting as a row variant or wrapper.
5. Add the random-parlays section below the table.
6. Add or update component tests for:
   - row insertion
   - caption copy
   - current-user styling
   - MEAN styling
   - separation of discovery content from the ranking table

## Open dependency

- Issue `#7` is blocked by issue `#4`.
- Do not treat this as a fully standalone implementation until that dependency is cleared.

## Suggested skills

- `codebase-design` - if the frontend engineer wants to refine component boundaries before coding.
- `implement` - for executing the feature once the design is locked.
- `tdd` - for writing the row-insertion and rendering tests first.
- `code-review` - for validating the finished leaderboard implementation against the PRD and issue.

## Success criteria

The implementation is done when:

- `GET /api/leaderboard` data is rendered as real rows plus a separate MEAN insertion.
- MEAN is visually distinct, correctly captioned, and never treated as a real account.
- The current user row is clearly marked.
- Random parlays are visibly separate from the leaderboard table.
- No time-range filter exists anywhere on the page.
