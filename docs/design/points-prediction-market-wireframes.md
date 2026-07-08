# Points Prediction Market Wireframes

Status: design handoff mockups for the PRD in `docs/prds/points-prediction-market.md`.

This document is self-contained for frontend implementation. It uses the PRD's domain language exactly: position, leg, stake, backer, member vote, rollover, HOUSE, MEAN, and Day's Parlay. Regular parlay legs are appended atomically with their first committed stake. Day's Parlay legs are claimed atomically with their first committed stake. Regular parlay rollover is a persistent member-only stake-weighted vote. Day's Parlay rollover is one user, one vote for the whole day.

## Visual System

Base stack: shadcn/ui default style, Tailwind, dark mode in scope.

Layout tone: compact, data-first, and game-like without becoming a finance terminal. Avoid hero/marketing sections inside the authenticated app. Use cards for repeated list items, dialogs, and framed controls only.

Status tokens:

| Role | Use | Visual treatment |
|---|---|---|
| `success` | won leg, favorable resolution | green badge, `Check` icon |
| `danger` | lost leg, unfavorable resolution | red badge, `X` icon |
| `live` | active leg only | blue solid badge, `Activity` icon, pulse or static ring |
| `pending` | committed/locked but not live | muted outline badge, dashed border, `Lock` + `Clock` icons |
| `info` | rolled-over salvage | violet badge, `CornerUpRight` icon |
| `voided` | voided/refunded | neutral outline badge, `CircleSlash` icon |

Non-status distinctions:

| Element | Treatment |
|---|---|
| MEAN row | muted row tint, `MEAN` badge, tooltip/caption says it is synthetic |
| HOUSE balance | plain stat in Day's Parlay only, not a leaderboard/account row |
| Current user row | left border accent plus "You" label where space allows |
| Price staleness | muted caption only after roughly 6s stale; no warning color |

## Desktop App Shell

Authenticated pages share one shell. Header balance is always visible because every buy, sell, stake, and commit is bounded by it.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Arena Points                         Balance 1,240 pts   @taren   Theme     │
├───────────────┬──────────────────────────────────────────────────────────────┤
│ Markets       │ Page content                                                │
│ Portfolio     │                                                              │
│ Parlays       │                                                              │
│ Day's Parlay  │                                                              │
│ Leaderboard   │                                                              │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

Desktop notes:

- Sidebar width stays fixed so page content does not shift.
- Header balance should update from `GET /api/me`, not from session claims.
- Use semantic navigation with the current page marked via `aria-current="page"`.

Mobile notes:

- Collapse sidebar into a bottom nav: Markets, Portfolio, Parlays, Day's, Board.
- Keep balance in the top bar, with username hidden under 360px.
- Bottom nav icons need labels; no icon-only guessing.

## Auth

### Login

```text
┌───────────────────────────────┐
│ Arena Points                  │
│                               │
│ Username                      │
│ [___________________________] │
│ Password                      │
│ [___________________________] │
│                               │
│ [ Log in ]                    │
│                               │
│ Invalid username or password  │
│ Need an account? Sign up      │
└───────────────────────────────┘
```

Behavior:

- Use one generic auth error. Do not reveal whether username or password failed.
- Submit button shows a loading state and remains full width on mobile.

### Signup

```text
┌───────────────────────────────┐
│ Create account                │
│                               │
│ Username                      │
│ [___________________________] │
│ Password                      │
│ [___________________________] │
│ Confirm password              │
│ [___________________________] │
│                               │
│ You're starting with 1,000    │
│ points.                       │
│                               │
│ [ Create account ]            │
└───────────────────────────────┘
```

Behavior:

- Username-taken and password-too-short are inline field errors.
- On success, auto-login and route to `/markets` or dashboard.
- Show `StartingBalanceBanner` once after first authenticated load.

Accessibility:

- Form fields have real labels, not placeholder-only labels.
- Error summaries should be announced via `aria-live="polite"`.

## Dashboard

The dashboard is a compact authenticated landing surface, not a marketing page.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ You're starting with 1,000 points.                              [Dismiss]    │
├──────────────────────────────────────────────┬───────────────────────────────┤
│ Day's Parlay                                 │ Quick actions                 │
│ Resets at 7:00 PM your time                  │ [Browse markets]              │
│                                              │ [Create parlay]               │
│ Leg 3 of 7: Will BTC close above...?         │ [View portfolio]              │
│ Live • 18 backers • 1 of 3 rollovers used    │                               │
│ [Open Day's Parlay]                          │ Balance: 1,240 pts            │
├──────────────────────────────────────────────┴───────────────────────────────┤
│ Your active parlays                                                          │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                           │
│ │ Monday crew  │ │ Weather run  │ │ Daily chain  │                           │
│ │ Leg 2 of 4   │ │ Pending      │ │ Day's Parlay │                           │
│ └──────────────┘ └──────────────┘ └──────────────┘                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

Mobile:

- Stack Day's Parlay card, quick actions, then active parlays.
- Avoid horizontal card carousels; use a simple vertical list.

## Market Browse

```text
Markets
┌──────────────────────────────────────────────────────────────────────────────┐
│ Politics Sports Crypto Esports Finance Tech Culture Weather Mentions         │
├──────────────────────────────────────────────────────────────────────────────┤
│ Event: 2026 US election markets                          Volume 1.2M         │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Will Candidate A win...?            Yes 58%  No 42%                     │ │
│ │ Sell at 0.57  Buy at 0.59           Resolves in 120d     [View]         │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ Will Candidate B be nominee...?     Yes 31%  No 69%                     │ │
│ │ Sell at 0.30  Buy at 0.32           Resolves Sep 10      [View]         │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ Event: Supreme Court decisions                                               │
│ [collapsed event row...]                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

States:

- Loading: skeleton event cards matching final card dimensions.
- Empty: muted inline state, not a full-page illustration.
- Closed markets should be visible only if returned inside an event for context, with actions disabled and a closed badge.

Mobile:

- Category tabs become horizontally scrollable tabs with visible overflow hint.
- Market rows stack prices under the question.
- Primary action is a full-width `View` button at the bottom of each row.

Accessibility:

- Expanded events use real buttons with `aria-expanded`.
- Tabs use shadcn `Tabs` semantics.
- Price text includes labels: "Sell at 0.57", "Buy at 0.59"; do not rely on column position alone.

## Market Detail

```text
Politics / 2026 US election / Market

┌──────────────────────────────────────────────────────────────────────────────┐
│ Will Candidate A win the election?                         Active            │
│ Resolves Nov 3, 2026 8:00 PM                                                 │
├────────────────────────────────────┬─────────────────────────────────────────┤
│ Price                              │ Buy                                     │
│ Sell at                            │ Outcome                                 │
│ 0.57                               │ [ Yes v ]                               │
│ Buy at                             │ Stake                                   │
│ 0.59                               │ [ 100                 ] pts             │
│ Price as of 8s ago                 │ Balance 1,240 pts                       │
│                                    │ ≈ 169.5 shares at 0.59                  │
│                                    │ [ Buy shares ]                          │
├────────────────────────────────────┴─────────────────────────────────────────┤
│ Your position                                                               │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Yes position          410 shares total     88 locked     322 available   │ │
│ │ Avg entry 0.61        Current value if sold now: 183.5 pts              │ │
│ │ [▸ Lots]                                      [Sell all available]       │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

Expanded sell lots:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▾ Yes position                                                              │
│ Lot             Entry     Shares     Locked     Available       Action       │
│ Jul 4 11:03     0.60      180        0          180             [Sell lot]   │
│ Jul 5 09:41     0.62      230        88         142             [Sell lot]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

Sell-all confirmation:

```text
Sell all available shares?
You will sell 2 purchases of this position, 322 available shares total, at the
current sell price. Shares locked into parlays are not included.

[Cancel] [Sell all available]
```

Closed market:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Resolved: Yes won                                                           │
│ Your payout: 410 pts                                                        │
│ Trading is closed for this market.                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- Copy uses "current value if sold now", never "P&L", because leaderboard is realized-points-only.
- Outcome selector appears only for multi-outcome markets.
- Stake input hard-disables submit past balance and explains the ceiling inline.
- `PriceStalenessIndicator` appears near bestBid/bestAsk, not as a toast.

## Portfolio

If the daily bankruptcy stipend has been granted, show a dismissible notice at the top of the Portfolio page, above `Open positions`. Copy: `Bankruptcy stipend received` / `The daily UTC stipend added +200 points because your balance was at or below 0.`

```text
Portfolio

Open positions
┌──────────────────────────────────────────────────────────────────────────────┐
│ Market / outcome            Avg entry  Shares   Locked  Value now  Action   │
├──────────────────────────────────────────────────────────────────────────────┤
│ ▸ Candidate A / Yes          0.61       410      88      183.5      Sell all │
│ ▸ Rain in Austin / No        0.44       220      0       127.6      Sell all │
└──────────────────────────────────────────────────────────────────────────────┘

Settled positions
┌──────────────────────────────────────────────────────────────────────────────┐
│ Market / outcome            Lots      Result            Points realized      │
├──────────────────────────────────────────────────────────────────────────────┤
│ ▸ Fed rate cut / Yes         3         Won               +420                │
│ ▸ Oscars Best Picture / No   1         Voided, refunded  0                  │
└──────────────────────────────────────────────────────────────────────────────┘

Your parlays
┌───────────────────────┐ ┌───────────────────────┐
│ Monday crew           │ │ Day's Parlay           │
│ Active: Leg 2 of 4    │ │ Live: Leg 3 of 7       │
│ [Open]                │ │ [Open]                 │
└───────────────────────┘ └───────────────────────┘
```

Expanded group row:

```text
▾ Candidate A / Yes
  Lot             Entry     Shares     Locked     Available     Realized/action
  Jul 4 11:03     0.60      180        0          180           [Sell this lot]
  Jul 5 09:41     0.62      230        88         142           [Sell this lot]
```

Mobile:

- Use grouped cards instead of a compressed table.
- Group header shows market, outcome, shares, value, and action.
- Lot details become a nested list under the expand button.

Accessibility:

- Tables remain semantic on desktop.
- Group expand controls are buttons with `aria-expanded`.
- Focus stays on the expand control after opening.
- Sell-all dialog traps focus and returns it to the triggering button.

## Leaderboard

```text
Leaderboard
All-time realized points

┌──────────────────────────────────────────┬───────────────────────────────────┐
│ Rank table                               │ Random parlays                    │
│                                          │ ┌───────────────────────────────┐ │
│ Rank  Player        Balance             │ │ Weather ladder                │ │
│ 1     nina          4,820               │ │ 5 members • Leg 2 of 6        │ │
│ 2     eli           3,910               │ │ 1.8x so far       [Open]      │ │
│ 3     MEAN          2,140    MEAN        │ └───────────────────────────────┘ │
│ 4     taren   You   1,940               │ ┌───────────────────────────────┐ │
│ 5     sam           1,710               │ │ Politics sweep                │ │
│                                          │ └───────────────────────────────┘ │
│ MEAN is the live average balance across │ ┌───────────────────────────────┐ │
│ active users only. It is not an account.│ │ Crypto sprint                 │ │
│                                          │ └───────────────────────────────┘ │
└──────────────────────────────────────────┴───────────────────────────────────┘
```

Notes:

- MEAN is inserted at its numeric position, not pinned to top or bottom.
- Random parlays are a separate module, never table rows.
- No time-range filter.
- Current user's row uses non-color signal where possible: "You" label plus left border.

Mobile:

- Leaderboard first, random parlays second.
- Rank table may become compact rows; keep rank, username, and balance visible.
- MEAN explanatory caption sits immediately below the MEAN row or table.

## Regular Parlay Browse

```text
Parlays
                                                       [Create parlay]
┌──────────────────────────────────────────────────────────────────────────────┐
│ Monday crew                                                                  │
│ 4 members • 5 legs • 1.6x so far                                             │
│ Active leg: Will BTC close above 100k? / Yes       Resolves in 4h            │
│ [Open]                                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ Weather ladder                                                               │
│ 3 members • 2 legs • Pending next leg                                        │
│ [Open]                                                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- Browse only includes parlays the user is a member of or has staked into.
- Discovery of random parlays lives on the Leaderboard page per PRD.

## Create Regular Parlay

### Step 1: Name and roster

```text
Create parlay

Step 1 of 2: Roster
┌──────────────────────────────────────────────────────────────────────────────┐
│ Name                                                                         │
│ [ Monday crew                                                     ]          │
│                                                                              │
│ Members                                                                      │
│ [ Search usernames...                                             ]          │
│ Selected: @nina  @eli  @sam                                                  │
│                                                                              │
│ Members can't be added later. Only added members can append legs.            │
│                                                                              │
│ [Cancel]                                                   [Continue]        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Step 2: First leg and committed position

```text
Step 2 of 2: First leg
┌──────────────────────────────────────────────────────────────────────────────┐
│ Market                                                                       │
│ [ Search/select market... ]                                                  │
│ Outcome                                                                      │
│ [ Yes v ]                                                                    │
│                                                                              │
│ Commit shares from your portfolio                                            │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Lot             Entry     Available shares       Commit                  │ │
│ │ Jul 4 11:03     0.60      180                    [ 100 ]                 │ │
│ │ Jul 5 09:41     0.62      142                    [  40 ]                 │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ These shares will be locked into this parlay. If a later or earlier leg       │
│ fails before payout, locked commitments can be lost to HOUSE.                 │
│                                                                              │
│ [Back]                                           [Create and lock shares]    │
└──────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- `EligiblePositionCommitSelector` shows source lots before commit only.
- Submit is a two-call flow: create draft parlay, then atomically create first leg with first stake.
- If the user has no eligible position, show: "Buy shares in this market first, then return to commit them."

Mobile:

- Wizard steps become full-width stacked panels.
- Lot commit inputs use numeric steppers or constrained numeric inputs.

## Regular Parlay Detail

```text
Monday crew
4 members • Creator: @taren • Chain sorted by resolution date

┌──────────────────────────────────────────────────────────────────────────────┐
│ Members: @taren @nina @eli @sam                         [Append leg]        │
├──────────────────────────────────────────────────────────────────────────────┤
│ Active now: Leg 2, Will BTC close above 100k?                                │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ Leg timeline                                                                 │
│                                                                              │
│ Jul 4 10:00  Won              Fed rate cut? / Yes                            │
│              @taren 120 pts, @nina 80 pts                                    │
│              Proceeds rolled forward                                         │
│                                                                              │
│ Jul 6 18:00  Live             BTC above 100k? / Yes                          │
│              Sell at 0.57 • Buy next at 0.62 • Price as of 8s ago            │
│              Backers: @taren 220, @eli 150, @outsider 90                     │
│              Member vote: 42% of member stake voting to roll over            │
│              Need >50%                                                       │
│              @taren 59% [Vote to roll over: off]                             │
│              @eli   41% [voting yes]                                         │
│              Non-member stake is affected by rollover but has no vote.        │
│                                                                              │
│ Jul 8 21:00  Pending, locked  Rain in Austin? / No                           │
│              Locked commitments: @sam 70 pts                                 │
│                                                                              │
│ Jul 9 22:00  Pending, locked  Candidate A wins? / Yes                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

Append leg panel:

```text
Append leg
┌──────────────────────────────────────────────────────────────────────────────┐
│ Market                                                                       │
│ [ Search/select market... ]                                                  │
│ Outcome [ Yes v ]                                                            │
│ Commit eligible shares                                                       │
│ [EligiblePositionCommitSelector]                                             │
│                                                                              │
│ These shares lock immediately. If an earlier leg fails before this leg is     │
│ reached, this commitment is lost to HOUSE.                                    │
│                                                                              │
│ Error: This market resolves before the current active leg (Jul 6) - it can't  │
│ be appended here.                                                            │
│                                                                              │
│ [Cancel]                                                    [Append leg]     │
└──────────────────────────────────────────────────────────────────────────────┘
```

Regular member-vote confirmation, decisive:

```text
Vote to roll over?
Your vote alone will trigger this rollover for the entire leg, including other
members' and backers' stakes.

Stop-loss preview
Current leg exit: 220 shares × sell at 0.57 = 125.4 pts
Next leg entry: buy at 0.62 ≈ 202.3 shares
Price as of 8s ago

[Cancel] [Vote to roll over]
```

Regular member-vote confirmation, non-decisive:

```text
Add your vote?
Add your vote, 14% of member stake, toward the >50% needed to roll over.

[Cancel] [Add vote]
```

Notes:

- Non-members see the tally and member list read-only.
- Members who have not staked on the active leg also see read-only state.
- Final leg renders no rollover control.
- There is no cash-out button anywhere.
- Reorder animation: new legs slide into server-sorted position on refetch.

Mobile:

- Timeline rail remains visible but narrows to date + badge.
- Vote member rows stack under the tally.
- Append form is a full-screen dialog or page section, not a cramped side sheet.

## Day's Parlay Dashboard Card

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Day's Parlay                                                                 │
│ Resets at 7:00 PM your time                                                  │
│                                                                              │
│ Leg 3 of 7 live now: BTC above 100k? / Yes                                   │
│ 18 backers • 1 of 3 rollovers used • Your vote: unspent                      │
│                                                                              │
│ Bonus pool if chain succeeds: 21,150 pts                                     │
│ [Open Day's Parlay]                                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- This card is the dashboard entry point.
- It must include local reset-time caption, because the boundary is 00:00 UTC globally.

## Day's Parlay Detail

```text
Day's Parlay
Resets at 7:00 PM your time

┌──────────────────────────────────────────────────────────────────────────────┐
│ Your vote: unspent                                             Sticky header │
│ Rollovers used today: 1 of 3                                                │
│ HOUSE balance: 42,300 pts - 50% (21,150) is today's bonus pool if the chain  │
│ succeeds. You contributed 340 of 2,100 total staked today.                  │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ Claim a market                                                               │
│ Eligible markets resolving today                                             │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Available  BTC above 100k? / Yes       Buy at 0.62       [Claim]         │ │
│ │ Claimed    Rain in Austin? / No        Claimed by @nina  [View leg]      │ │
│ │ Closed     Lakers win? / Yes                            Unavailable      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ Leg timeline                                                                 │
│ Jul 6 10:00  Won              Fed rate cut? / Yes                            │
│              Backers: @taren 100, @nina 80                                   │
│                                                                              │
│ Jul 6 14:00  Rolled over      Oil above 90? / No                             │
│              10 of 17 backers voted to roll over                             │
│                                                                              │
│ Jul 6 18:00  Live             BTC above 100k? / Yes                          │
│              Backers: @taren 220, @eli 150, @sam 90                          │
│              Rollover vote: 3 of 8 backers voted yes (needs 5)               │
│              [Spend today's vote on this leg]                                │
│                                                                              │
│ Jul 6 22:00  Pending, locked  Candidate A wins debate? / Yes                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

Claim confirmation:

```text
Claim this market for Day's Parlay?
You will lock 140 shares into this leg. Other users' earlier legs can kill the
chain before this leg is reached, and your committed shares would still be lost
to HOUSE.

[Cancel] [Claim and lock shares]
```

Vote spend confirmation:

```text
Spend your one rollover vote on this leg?
You won't be able to vote on any other leg today.

Stop-loss preview
Current leg exit: 220 shares × sell at 0.57 = 125.4 pts
Next leg entry: buy at 0.62 ≈ 202.3 shares
Price as of 8s ago

[Cancel] [Spend vote]
```

After vote is spent:

```text
Your vote: spent on Leg 3: BTC above 100k?        [Jump to leg]

Other backed leg control:
[Vote unavailable]
You've already spent today's vote on Leg 3.
```

Notes:

- `VoteStatusHeader` is sticky/persistent within the Day's Parlay page.
- Day's Parlay `RolloverControl` is headcount display only; `VoteSpendButton` owns the irreversible action.
- Claimed markets remain visible in the claim table with reason and link.
- Rollover cap is global and always visible.
- HOUSE is shown here only.

Mobile:

- Sticky vote header remains below the app top bar.
- Claim table becomes a list of market cards.
- The vote spend button is full width inside backed active-leg rows.

## Shared Components

### `LegTimeline`

Purpose: vertical ordered-leg view for regular parlay and Day's Parlay detail.

```text
┌──────────────┬───────────────────────────────────────────────────────────────┐
│ Date/time    │ Leg content                                                   │
├──────────────┼───────────────────────────────────────────────────────────────┤
│ Jul 6 10:00  │ [LegStatusBadge] Market question / outcome                    │
│              │ Backer summary, prices, vote controls                         │
│              │ Optional: "Parlay stakes are locked until final resolution."   │
└──────────────┴───────────────────────────────────────────────────────────────┘
```

States:

- One active row maximum.
- Active marker is sticky within the timeline scroll container.
- Insert animation should use layout animation keyed by stable `leg.id`.
- Render array order from API; do not independently sort in the component.

Accessibility:

- DOM order must match visual order after refetch.
- Active/live motion respects `prefers-reduced-motion`.
- Each row has an anchor id, such as `leg-{legId}`, for vote-status jump links.

### `LegStatusBadge`

Variants:

| Status | Label | Icon | Shape |
|---|---|---|---|
| `PENDING` | Pending, locked | `Lock` + `Clock` | dashed outline |
| `ACTIVE` | Live | `Activity` or `Radio` | solid + pulse/static ring |
| `RESOLVED_WON` | Won | `Check` | solid |
| `RESOLVED_LOST` | Lost | `X` | solid |
| `ROLLED_OVER` | Rolled over | `CornerUpRight` | solid info |
| `VOIDED` | Voided, refunded | `CircleSlash` | neutral outline |

Rules:

- Badge text is always present; icon and color never carry meaning alone.
- Do not reuse green for primary actions, to keep green reserved for favorable outcomes.

### `RolloverControl`

Regular parlay, `votingMode="stakeWeighted"`:

```text
Member vote
[████████████░░░░░] 62% of member stake voting to roll over
Need >50%

@taren 45%  Voting yes
@nina  31%  Not voting
@eli   24%  [Vote to roll over]
```

Day's Parlay, `votingMode="headcount"`:

```text
Rollover vote
[██████░░░░░░░░░░░] 3 of 8 backers voted yes
Needs 5 to pass

[VoteSpendButton renders separately when eligible]
```

Rules:

- Regular mode can render a reversible member toggle.
- Day's mode never renders a reversible toggle.
- Final leg renders no control.
- Stop-loss preview appears inside the vote confirmation dialog, not as a standalone early-rollover panel.
- Non-voting regular parlay backers see the tally read-only.

Accessibility:

- Tally text uses `aria-live="polite"`.
- Toggle labels include action and current state.
- Dialogs default focus to cancel/neutral action when the decision is irreversible or decisive.

### `VoteStatusHeader`

```text
Your vote: unspent
```

```text
Your vote: spent on Leg 3: BTC above 100k? [Jump to leg]
```

Rules:

- Page-level component for Day's Parlay only.
- Sticky within Day's Parlay detail.
- Reads from `myVote`.
- Never appears on regular parlay pages.

### `VoteSpendButton`

States:

| State | UI |
|---|---|
| Eligible and unspent | `Spend today's vote on this leg` button |
| Vote spent on this leg | static "Vote spent here" state |
| Vote spent elsewhere | disabled-with-reason state |
| Not a backer | no button; optional explanatory text in leg stake area |
| Rollover cap reached | disabled-with-reason: "3 of 3 rollovers already used today" |

Accessibility:

- Use `aria-disabled` plus visible reason text for unavailable states.
- Confirmation copy explicitly says the vote cannot be used elsewhere today.

### `EligiblePositionCommitSelector`

```text
Commit shares from your portfolio
┌──────────────────────────────────────────────────────────────────────────────┐
│ Lot             Entry     Available     Locked elsewhere     Commit          │
│ Jul 4 11:03     0.60      180           0                    [ 100 ]         │
│ Jul 5 09:41     0.62      142           88                   [  40 ]         │
└──────────────────────────────────────────────────────────────────────────────┘
Selected: 140 shares
```

Rules:

- Filters to open positions matching selected market and outcome.
- `availableShares = shares - committedShares`.
- Commit input cannot exceed available shares.
- If no eligible lots, show a clear empty state and link to buy page.
- Used in regular parlay first-leg creation, regular append, and Day's Parlay claim.

Accessibility:

- Numeric inputs have labels containing lot date and available share count.
- Selection totals update in `aria-live="polite"`.

### `PriceStalenessIndicator`

```text
Price as of 8s ago
```

Rules:

- Hidden when age is below roughly 6 seconds.
- Muted text, no warning color, no toast.
- Appears on market detail price panel, active leg price display, and stop-loss previews.
- Uses `lastSyncedAt` from market API responses.

### `HouseBalanceStat`

```text
HOUSE balance: 42,300 pts - 50% (21,150) is today's bonus pool if the chain succeeds.
You contributed 340 of 2,100 total staked today.
```

Rules:

- Day's Parlay only.
- Plain stat, not a card that competes with primary chain state.
- Bonus math is based on fresh principal contributed, not compounded winnings.

## Responsive Layout Summary

| Screen | Desktop | Mobile |
|---|---|---|
| Auth | centered card | full-width card with page padding |
| Dashboard | 2-column top, active-parlays row | stacked sections |
| Market browse | tabs + expandable event list | horizontal tabs + stacked market cards |
| Market detail | price/buy side-by-side, positions below | header, price, buy, sell stack |
| Portfolio | semantic grouped tables | grouped position cards |
| Leaderboard | table + random parlays side rail | table/list first, random parlays below |
| Parlay detail | timeline with fixed date rail | narrow rail, stacked vote/backer details |
| Day's Parlay | sticky vote header + claim table + timeline | sticky header + claim cards + timeline |

Minimum touch targets: 44px for primary actions, expand controls, vote buttons, and sell buttons.

## Accessibility Checklist

- Every state uses label text plus icon/shape; never color alone.
- Live pulse respects `prefers-reduced-motion` and falls back to a static ring.
- Dialogs trap focus and return focus to the triggering element.
- Irreversible dialogs default focus to Cancel, not Confirm.
- Disabled controls include a visible reason associated with `aria-describedby`.
- Tables use semantic markup where tables remain visually tables.
- Expand controls are buttons with `aria-expanded`.
- Tally changes use `aria-live="polite"`, not assertive.
- Price and action labels are explicit: "Sell at", "Buy at", "current value if sold now".
- No cash-out button exists in parlay screens, disabled or otherwise.

## Implementation Guardrails

- Do not add issue-creation flows from this design work.
- Do not show HOUSE on leaderboard or dashboard as a competitive account.
- Do not show MEAN as a real user.
- Do not add time-range filters to leaderboard.
- Do not add market browse sort/filter beyond category tabs for v1.
- Do not create a separate early-rollover button; rollover happens only through a vote crossing threshold.
- Do not show source `LegStakeSource` rows after commit; show aggregate backer stake in parlay details.
- Do not client-sort leg timelines for rendering; render server-sorted API order.
- Do not separate append/claim from first stake in UI; the leg creator must commit shares in the same flow.
