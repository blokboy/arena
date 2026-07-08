# Points Prediction Market — PRD & Implementation Plan

This document is the single source of truth for the points prediction market product: the product spec (Part I), and the Design, Backend, and Frontend implementation plans (Parts II–IV) that were developed against it and cross-checked for consistency with one another. It supersedes the previously separate planning docs under `docs/plans/points-prediction-market/`.

Domain terminology and architectural decisions are also tracked in `CONTEXT.md` (repo root) and `docs/adr/` — this document references them as **ADR-0001** (`docs/adr/0001-leg-creation-requires-atomic-initial-stake.md`), **ADR-0002** (`docs/adr/0002-stake-weighted-leg-control-replaces-backer-count-branching.md`, superseded), and **ADR-0003** (`docs/adr/0003-member-only-stake-weighted-rollover-vote.md`, current).

**How the plans relate:** Design and Backend were planned independently (Part II has no dependency on Part III, and vice versa). Frontend (Part IV) was then planned on top of both, and flagged a handful of schema/API gaps back to Backend. Backend did one more pass to close those gaps — those resolutions are threaded directly into Part III below (see Part III §7 for a scannable index) and cross-referenced from Part IV where relevant. One implementation-level question was found still open after that pass, resolved directly in Part IV §1 during final consolidation (an optional `marketId` filter on `GET /api/positions`); the one product/PM-level question (the Day's Parlay day-boundary timezone) has since been decided — **UTC**, so that "today's" Day's Parlay is the same chain for every user regardless of timezone, rather than fragmenting into a different rolling window per region — see Part I §8, Part III §4, and Part IV §5.

**Grilling session (post-consolidation):** a subsequent stress-test interview surfaced further product-level corrections, recorded as ADRs and threaded through all four parts: leg creation is atomic with its first stake, not a separable step (ADR-0001); and rollover authority for regular parlays is a persistent, member-only, stake-weighted vote (ADR-0003) — not branched by backer count, not tied to the parlay creator, and (per an intermediate design, ADR-0002, since superseded) not a single backer's unilateral "control" either. It also scoped the MEAN leaderboard benchmark to active traders only (Part I §5) and flagged one pre-implementation verification task — whether multi-outcome markets collapse `outcomePrices` the same way binary markets do (Part III §6.1).

---

## Part I — Product Specification

### Summary

A points-based prediction market. Users get a starting balance of points (no real money involved) and use them to buy mock positions on real, live Polymarket markets — pulled via the public Gamma API — across a curated set of categories. Positions settle against real-world market resolution. A leaderboard ranks users by realized points, benchmarked against the mean balance across all users. Beyond single-market trades, users can commit already-purchased positions into **parlays** — chains of markets ordered by resolution date, where committed value rolls from one leg into the next — either a small closed group they invite, or a system-wide daily collective parlay ("Day's Parlay") that anyone can contribute a pick to.

### Goals

- Let users test prediction-market instincts against real market data, without real money.
- Surface a comparative leaderboard (individual rank + the field's average) to make skill legible.
- Give engaged users a deeper, higher-variance format (parlays) beyond single bets.
- Keep the system's real API dependency (Polymarket) to public, unauthenticated, read-only endpoints only.

### Non-goals

- No real money, real Polymarket trading, or real wallet integration.
- No seasons/resets for the leaderboard in this version (all-time only).
- No mark-to-market of open positions on the leaderboard — only realized (settled) points count.

---

### 1. Market data (Polymarket Gamma API)

All market data is public, unauthenticated Gamma API. No CLOB order placement, no wallet, no auth credentials against Polymarket.

Base URL: `https://gamma-api.polymarket.com`

**Category → tag mapping** (verified against the live API):

| Category | tag slug | tag id |
|---|---|---|
| Politics | `politics` | 2 |
| Sports | `sports` | 1 |
| Crypto | `crypto` | 21 |
| Esports | `esports` | 64 |
| Finance | `finance` | 120 |
| Tech | `tech` | 1401 |
| Culture | `pop-culture` | 596 |
| Weather | `weather` | 84 |
| Mentions | `mention-markets` | 100343 |

**Discovery query** (per category, top 10 by volume):

```
GET /events?tag_id=<id>&active=true&closed=false&order=volume&ascending=false&limit=10
```

Each event contains a `markets[]` array. Users trade **individual markets** within an event (e.g. a specific candidate within an "Election" event), not the event as a whole.

**Fields used from a market object**:

- `outcomes` / `outcomePrices` — outcome labels and current prices (probabilities)
- `bestBid`, `bestAsk`, `lastTradePrice` — live pricing
- `active`, `closed` — lifecycle state
- `endDate` / `endDateIso` — used for resolution-date ordering
- On resolution, `outcomePrices` collapses to `"1"`/`"0"` per outcome (verified against a real resolved market) — this is how settlement detects the winning outcome. No separate CLOB integration is needed.

**Rate limits**: ~60 req/min unauthenticated. The backend must cache/proxy Gamma responses server-side rather than letting clients poll Gamma directly — implementation detail for the Backend agent, not a product decision.

---

### 2. Accounts & auth

- Username + password (no OAuth).
- Implemented via Auth.js (NextAuth) Credentials provider — gives secure session/cookie handling without hand-rolling it, while still avoiding third-party OAuth setup.
- Password hashing via a standard library (e.g. bcrypt) in the Credentials provider's `authorize` callback.

---

### 3. Points economy

- New users start with **1,000 points**.
- Points are a single unified currency across single-market trades, regular parlays, and Day's Parlay.
- **Bankruptcy stipend**: a daily cron job grants **+200 points (20% of starting balance)** to any account at or below 0. Not a universal top-up — only zeroed-out accounts qualify.

---

### 4. Single-market trading

- Stake is **variable and user-chosen**, bounded by current balance.
- **Buy at `bestAsk`, sell at `bestBid`** — respects the real spread; buying and instantly selling always costs something (no free round-trips).
- Users may **exit before resolution** (sell at current `bestBid`) or **hold to resolution**.
- A buy creates one or more portfolio positions/lots. Parlays do **not** debit points a second time: users add already-purchased shares from their portfolio to parlay legs. Once shares are committed to a parlay leg, those shares are locked to that parlay's lifecycle and are no longer available for ordinary portfolio selling.
- **Resolution settlement**: a scheduled job polls Gamma for markets with open positions; when `closed=true`, pay out `uncommittedShares × outcomePrice` for the held outcome on ordinary portfolio positions. Shares already committed to parlays are excluded from single-market settlement and settle only through their parlay leg.
- Losses on single-market trades simply evaporate (do **not** feed HOUSE — that rule is parlay-specific).

---

### 5. Leaderboard: MEAN and ranking

- Leaderboard is **all-time, realized-points-only** — no mark-to-market of open positions.
- **MEAN**: a synthetic leaderboard row showing the live average (`AVG(balance)`) across **active users only** — a comparison benchmark, purely computed/display, not a real account. A user counts as active once they've ever created at least one single-market position or parlay stake, win or lose, no recency window; dormant signups sitting at the starting 1,000 balance are excluded so the benchmark reflects real trading rather than signup volume. See `CONTEXT.md`, "Active user."

---

### 6. HOUSE (pooled account)

Distinct from MEAN. HOUSE is a **real points-holding account**:

- Receives **100% of points lost from parlays** (regular multiplayer parlays and Day's Parlay) — not single-market trade losses.
- Funds the Day's Parlay payout (see §8): 50% of HOUSE's current balance is distributed to Day's Parlay stakers when a day's chain succeeds.

---

### 7. Regular multiplayer parlay

#### Structure

- A parlay is an **ordered sequence of legs** (market + outcome pick), **always sorted by resolution date**, regardless of the order legs were picked or appended. If a leg resolving sooner is added after one resolving later, it is inserted at its correct chronological position — not left in add-order.
- **Position-funded legs**: a user first buys shares in the relevant market/outcome as a portfolio position at Polymarket's current `bestAsk`; adding to a parlay commits some or all of those already-purchased shares to the leg. Leg 1 starts with committed shares immediately. Later legs can be seeded by committing existing portfolio shares within the valid append window, and rolled-forward value from a prior winning leg can add more committed value to the next leg when it becomes active. This preserves the product rule that points are debited at position purchase time, not again at parlay-add time.

#### Membership (two tiers)

1. **Formal membership** — closed/invite-only, fixed at creation. The creator selects the initial roster; no one can be added to this tier later. Any member in this tier can **append** new legs to the shared sequence at any time.
   - **Append validation**: a newly appended leg's resolution date must be later than the currently-active leg's resolution date. An earlier-resolving append is rejected (that specific leg only) — it does not block the group from appending other, validly-ordered legs. This is necessary because the active leg already has live, executed positions that can't be retroactively reordered.
   - **Appending is atomic with committing shares** (ADR-0001): a member can't add a market to the chain without committing already-purchased shares in that market/outcome — there is no such thing as a leg in a chain with zero backers. The appender's committed position is the leg's first stake, not a separate follow-up step.
2. **Open staking/backing** — any platform user (member or not) can add already-purchased shares to whichever leg is currently active, sharing proportionally in that leg's outcome as it rolls forward. Backing a leg only grants rollover-voting rights in regular parlays when the backer is also a formal member (see below).

#### Commitment & exit

- **No early cash-out** to free balance — once staked, points stay committed to the parlay until the final leg resolves (win = realized payout; loss = it's gone).
- **Future-leg commitments are at risk immediately** — appending/claiming a later leg locks the committed shares as soon as the leg is added, even though the leg is not live yet. If an earlier leg fails before that pending leg is reached, the pending leg's committed shares are forfeited to HOUSE along with the rest of the remaining parlay value.
- **Early rollover (stop-loss)**: for any **non-final** leg, before it resolves, a leg can be exited early at that leg's live `bestBid` and immediately redeployed into the next leg's `bestAsk`. This salvages a position at reduced value instead of risking a full loss to $0. Not available on the final leg — it must be held to actual resolution. Whether this happens for a leg is governed by the member vote, below.

#### Rollover authority (member vote)

See ADR-0003 (current) — an earlier design, ADR-0002, gave unilateral control to any backer who crossed a stake threshold; it's superseded because it let non-members outspend the roster's own decision-making, and because its no-majority case needed an awkward tiebreaker that turned out to be unnecessary.

- Rollover on a leg is decided by a **persistent, toggleable vote restricted to that leg's formal-member backers**. Open/non-member stakers participate economically (they share proportionally in the leg's outcome) but have **no vote** here at all.
- Each member's vote is **weighted by their current stake on that leg** (recomputed live, not fixed at the moment they voted — if a member adds more stake later, their vote's weight grows accordingly).
- The instant the combined stake of members voting "yes" exceeds **50% of the leg's total member stake** (non-member stake excluded from that total), the rollover executes for **the whole leg** — every backer's stake moves together, including non-members' money, even though they had no say in the decision.
- A member whose own stake alone exceeds 50% of the member total can pass the vote unilaterally — this isn't a separate mechanic, it's just the case where one vote alone clears the threshold.
- If no combination of "yes" votes ever crosses 50%, **nothing happens** — the leg simply rides to its actual resolution, exactly as if no one had voted. This is a valid, complete default, not a deadlock.
- The parlay creator has **no standing authority** beyond their own stake-weighted vote — the same as any other member. There is no owner-level override, and no single-backer "control" concept, separate from this vote.

#### Losses

- 100% of a stake lost when a parlay leg fails (without a successful rollover) transfers to HOUSE.

---

### 8. Day's Parlay

A single system-wide collective parlay per calendar day, with crowd-sourced legs.

#### Legs

- Available markets are pulled from the same 9-category curated pool (§1), filtered to those **resolving that calendar day**.
- **One leg claim per market per day** — first-come-first-served. Prevents two legs resolving at the same instant and keeps the day's chain diverse.
- Legs are ordered by resolution time within the day; same locked-commitment and active-leg transition model as the regular parlay.
- **Day boundary: 00:00 UTC**, globally — a deliberate product decision, not a technical default. Day's Parlay is one shared, system-wide chain; anchoring the boundary to UTC means every user worldwide is looking at and contributing to the *same* day's chain, rather than the day fragmenting into a different rolling window per viewer's local timezone. See Part IV §5, item 3 for how this is made legible in the UI (a client-side "resets at [your local time]" caption) without changing the underlying boundary.

#### Staking & voting

- **Claiming a market is atomic with committing shares** (same rule as regular-parlay append, §7): claiming is the "formal" action (one per market, first-come-first-served), and a claimer must commit already-purchased shares in that outcome to claim it — there is no such thing as a claimed-but-unstaked leg. Staking beyond that first committed position is **open** — any platform user can back any leg, claimed by them or not, by committing their own already-purchased shares and sharing proportionally in that leg's outcome.
- Backing a leg grants rollover-voting rights **on that specific leg**.
- **Contrast with regular multiplayer parlays (§7)**: this vote is **headcount-based, one vote per backer**, and open to *every* backer — there's no "member" tier here at all, and no stake-weighting. That's a deliberate double difference from §7's member vote: regular parlays restrict and weight the vote because it's a small, self-selected roster of trusted co-creators; Day's Parlay is a system-wide, anyone-can-back daily format, where either restricting eligibility or weighting by capital would let some subset (or one deep-pocketed stranger) dominate a decision affecting everyone.
- **Vote limit**: each backer gets **exactly one rollover vote to spend across the entire day's parlay**, usable only on a leg they personally staked into. Spending it on one leg is irreversible and leaves them with no vote for any other leg that day, even ones they've also backed. This one-user-one-vote scarcity is the point of the format: it tests whether democratic coordination can regularly produce winning outcomes.
- **Rollover cap**: at most **3 rollovers per day**, each requiring majority vote among that leg's backers.

#### Success/failure and payout

- **Success**: every leg in the day's chain either wins outright or is salvaged via one of the (at most 3) rollovers before it would have lost. Any un-rolled loss kills the whole day's chain.
- **Failure**: 100% of that day's remaining staked points are lost to HOUSE, same as a regular parlay loss. This includes already-committed shares on later pending legs that were never reached because an earlier leg failed.
- **On success**, backers receive **both**:
  1. Their own proportional stake winnings from riding the chain (standard parlay economics, compounding via `bestBid`/`bestAsk` through each leg), **and**
  2. A share of **50% of HOUSE's current balance**, split among all that day's stakers, **proportional to the total fresh stake each user committed into that Day's Parlay**. Voting is not required for bonus eligibility; staking is the qualifying action. Rolled-forward proceeds are not counted again for bonus-share weighting; otherwise the same original stake could be double-counted as it moves through the chain.

---

### 9. Tech stack

- **Framework**: Next.js (single deployable, API routes + frontend).
- **Styling**: Tailwind CSS + shadcn/ui.
- **Database**: Postgres via Vercel Postgres (Neon-backed).
- **ORM**: Prisma.
- **Auth**: Auth.js, Credentials provider (username/password).
- **Hosting**: Vercel.
- **Scheduled jobs**: Vercel Cron, for:
  - Market-resolution settlement (single-market positions and parlay legs)
  - Daily bankruptcy stipend
  - Day's Parlay daily rollover/lifecycle management

---

### 10. Open implementation risks (as originally scoped — now resolved, see Part III §6)

- **Gamma rate limit (~60 req/min unauthenticated)**: requires a server-side caching layer; clients must not poll Gamma directly. → Resolved: Part III §3 (two-tier cache) and §6.3 (rate limiter + backoff added on top).
- **Voided/cancelled markets**: Polymarket markets can be voided rather than resolving Yes/No. Settlement logic needs a defined fallback. → Resolved: Part III §6.1 (flat principal refund; a `VOIDED` terminal status).
- **Tie-breaking within Day's Parlay ordering**: two distinct markets resolving at the exact same timestamp still need a deterministic secondary sort. → Resolved: Part III §6.2 (`endDate ASC, gammaId ASC`).

---

## Part II — Design Implementation Plan

Status: no existing design system in this repo (greenfield). This plan establishes a minimal system on top of Tailwind + shadcn/ui defaults — not a competing system — scoped to exactly what this product needs. Frontend should treat shadcn/ui's default theme, spacing, and component primitives as the baseline and only diverge per "Design tokens" below.

Domain language is tracked in `CONTEXT.md` and `docs/adr/` as well as Part I above — leg, stake, backer, roster, rollover, HOUSE, MEAN, Day's Parlay. Frontend/copy should reuse these terms verbatim rather than inventing synonyms.

### 1. Screen / flow inventory

#### Auth
- **Login** — username + password, single form, standard shadcn `Card` + `Form`. Error state: generic "invalid username or password" (do not disclose which field is wrong).
- **Signup** — username + password + confirm. Inline validation (username taken, password too short). On success: auto-login, redirect to Markets browse. Show starting balance ("You're starting with 1,000 points") once, on first dashboard load, as a dismissible banner — not a modal (don't block).

#### Market browse
- Tab or segmented control across the 9 categories (Politics, Sports, Crypto, Esports, Finance, Tech, Culture, Weather, Mentions). One category active at a time; default to Politics or a "For you"-less first tab — no personalization in scope.
- Grid/list of events, each expandable to its `markets[]`. Card shows: market question, outcome(s) with current price (%), bestBid/bestAsk spread as small print, volume, resolution date (relative, e.g. "resolves in 3d").
- Empty/loading states: skeleton cards (not spinners) since this is a list of ~10 items per category.
- Sort/filter: none required by PRD beyond the category tabs — do not add scope here.

#### Market detail + trade panel
- Header: event context breadcrumb (Category / Event / Market), question, resolution date, `active`/`closed` badge.
- Price panel: current bestBid / bestAsk shown side by side, labeled explicitly ("Sell at" / "Buy at") since the spread is a real product mechanic users need to understand, not just a data readout.
- Trade panel (buy): stake input (numeric, bounded by current balance, show balance inline as a ceiling — disable submit past it, don't just error after), outcome selector if market has >2 outcomes, resulting shares preview ("≈ 142.8 shares at 0.70"), confirm button.
- If user holds positions: separate "Sell" panel showing current bestBid, unrealized value at current price (labeled "current value if sold now" — not "P&L" to avoid implying this is marked-to-market on the leaderboard, since PRD §5 says only realized points count there). The panel supports both selling individual lots purchased at different times/entry prices and a "Sell all" action that closes every open lot for the selected market/outcome.
- Resolution banner once `closed=true`: shows outcome and payout received, panel converts to read-only.

#### Portfolio / positions
- Two sections: **Open positions** and **Settled positions**, not one merged table with a status column — the action available (sell) only applies to open ones, so keep them visually and structurally separate.
- **Grouped by market + outcome, not one row per buy**: a user who bought into the same market/outcome more than once (dollar-cost-averaging in, per §4/Part I) sees one group row per `(market, outcome)`, not N flat rows. The group row shows a blended average entry price (`totalStake / totalShares` across its lots), total shares, and current value at bestBid — this is a display aggregation only, the underlying buys are never merged into a single record (see Part III/IV for the lot model).
- An **expand control** on each group reveals its individual purchase lots — each with its own entry price, share count, and purchase timestamp — so a user can see exactly when and at what price each slice was bought (or, for settled groups, resolved).
- **Two sell actions, not one**: "Sell all" at the group level (closes every open lot in the group at once, at current bestBid — a true one-shot close, not oldest-first/FIFO), and a per-lot "sell this lot" inside the expanded view (closes just that one purchase). Both need to be clearly distinct controls — a user choosing "sell all" should not be surprised that it touches lots they'd forgotten about. **"Sell all" requires a confirmation dialog** stating how many lots and total shares it will close (e.g. "Sell all 3 purchases of this position — 428 shares total?") — unlike per-lot selling (a single, already-legible action), "sell all" can silently include lots the user forgot they held, so it needs the same irreversible-consequence treatment as the other confirmation dialogs in §4.
- Settled: same grouped/expandable treatment as open positions, for consistency — a market bought into three times and later resolved shows one group with three settled lots underneath, not three flat rows repeating the same market name.
- Also surfaces: any active parlays / Day's Parlay participation the user has stake in, as a separate section linking out (don't duplicate parlay leg detail here).

#### Leaderboard
- Ranked table: rank, username, balance. **MEAN row is visually distinct** (different background tint, pinned position — recommend pinned where it chronologically falls in rank order, not forced to top/bottom, since its comparative value depends on where the user sits relative to it) with a label badge "MEAN" and a tooltip/caption: "Live average balance across all users — not a real account." This distinction matters because MEAN is synthetic and must never be mistaken for a competitor.
- Current user's row highlighted (e.g. left border accent) so they can find themselves without scanning ranks.
- Surface **3 random existing regular parlays** on the Leaderboard page as a discovery module, separate from the ranked table. These are not leaderboard rows and should not visually compete with MEAN or user ranking.
- No time-range filter (PRD: all-time only, no seasons) — do not build a dropdown for this.

#### Regular parlay — browse / discovery
- List of parlays the user is a member of or has staked into, plus a small discovery surface of 3 random existing parlays on the Leaderboard page. Card shows: name/creator, roster size, current active leg (market + outcome), chain length (N legs), cumulative multiplier so far.

#### Regular parlay — creation
- Step 1: name the parlay, select initial roster (formal members) — searchable user picker backed by username search across all users, roster is **locked after creation** (say this explicitly in the UI: "Members can't be added later — only added members can append legs"). This is a one-time, consequential choice; surface it before submission, not buried in help text.
- Step 2: add first leg by selecting an already-purchased position/share lot from the user's portfolio for the desired market/outcome and choosing how many shares to commit — this becomes leg 1 and locks those shares into the parlay.

#### Regular parlay — detail (the hard screen, see §2 for interaction spec)
- Ordered leg list (chronological by resolution date), each leg showing its state (see state machine below).
- Append-leg action (requires committing already-purchased shares in that market/outcome — see §2.3), visible only to formal members.
- Append/claim confirmation must make the risk plain before submission: "These shares will be locked into this parlay. If an earlier leg fails before this leg is reached, this commitment is lost to HOUSE."
- Per-leg: backer list, stake amounts, and a live stake-weighted vote tally among the leg's formal members (see §2.3).
- Early-rollover (stop-loss) action on the current non-final active leg only, decided by the leg's member vote crossing its pass threshold.

#### Day's Parlay
- Single system-wide view per calendar day (no "browse", there's only one). Landing surface: banner/card on the dashboard summarizing today's chain progress ("Leg 3 of 7, live now: ...").
- Full view: same ordered-leg-list pattern as regular parlay, but with:
  - **Claim-a-leg** action: any unclaimed market (from that day's eligible pool) can be claimed once by committing already-purchased shares in the selected outcome, first-come-first-served — show claimed markets as unavailable immediately (optimistic UI + server reconciliation) to reduce race-condition confusion.
  - Claim confirmation uses the same locked-commitment warning as regular parlays, with stronger Day's-Parlay framing: other users' earlier legs can kill the chain before this leg is reached, and the committed shares would still be lost to HOUSE.
  - **Per-leg backer list** — every leg shows who backed it and how much, since backing grants voting rights and this needs to be legible before a user commits their one vote.
  - **Vote-spending UI** — see §2.4, the highest-risk interaction on this screen.
  - Rollover counter: "1 of 3 rollovers used today" always visible at the top of the page (global cap, not per-leg).

#### HOUSE balance
- PRD does not require it to be user-facing as an account (§6 says HOUSE is real but distinct from MEAN, and its role is payout funding). Recommend surfacing it read-only, small, in the Day's Parlay view only, since 50% of it directly determines that day's bonus payout pool: "HOUSE balance: 42,300 — 50% (21,150) is today's bonus pool if the chain succeeds." This gives users the actual stake in outcome without turning HOUSE into a pseudo-leaderboard entry. Do not show it on the main dashboard or leaderboard — it's not a comparison target.

---

### 2. Key interaction / state design

#### 2.1 Leg ordering by resolution date (reordering as legs are appended)

Problem: legs are always sorted by resolution date regardless of append order, and a newly appended leg can land anywhere in the sequence except before the active leg. Users must never be confused about "did my leg get inserted where I expected."

Design:
- Render the chain as a **vertical timeline**, not a horizontal carousel — vertical scales better to N legs and reads naturally as "top = already resolved / in progress, bottom = future," matching how a changelog or transaction history reads.
- Each leg's row shows its resolution date/time prominently on the left rail (a running vertical axis, like a timeline component), so the chronological logic is visually the sort key, not an implicit list order. Users should be able to see "this is why leg B is above leg C" just from the dates in the rail.
- When a leg is appended, animate it sliding into its computed position (not appending to the bottom then jumping) — this is the single highest-value micro-interaction on this screen for avoiding "where did my leg go" confusion. Flag to Frontend: this needs a real insert-transition, not a full-list re-render/re-mount.
- Reject a badly-ordered append leg with an inline error at the point of entry ("This market resolves before the current active leg (Jul 6) — it can't be appended here"), not a silent failure or toast that disappears. Cite the conflicting date so the user understands *why*, not just *that*.
- Show a persistent "you are here" marker (see 2.2) pinned to the currently active leg regardless of scroll position — sticky within the timeline panel — since on a long chain the active leg may not be the top visible item.

#### 2.2 JIT execution state machine per leg

Every leg must show exactly one of five states, and the state must be legible without relying on position in the list alone (a leg's position tells you order, not lifecycle state).

| State | Meaning | Badge label | Badge color role | Non-color signal |
|---|---|---|---|---|
| Pending | Shares are already committed and locked, but this leg is not live yet | "Pending, locked" | neutral/muted | outline-style badge (dashed border) + lock/clock icon pair |
| Active / live | Currently the resolving-next leg; position is bought and live right now | "Live" | live accent | solid badge + pulsing/animated dot indicator + icon (a static dot alone is a color-only signal — pair with a distinct shape/motion, and respect `prefers-reduced-motion`) |
| Resolved — won | Resolved in the held outcome's favor; proceeds rolled forward (or paid out if final leg) | "Won" | success | check icon inside badge |
| Resolved — lost | Resolved against; no successful rollover in time | "Lost" | danger | x icon inside badge |
| Rolled over | Would have lost, but the leg was exited early into the next leg (stop-loss), triggered once the leg's member vote (regular parlay) or backer vote (Day's Parlay) crossed its pass threshold — a distinct terminal state, not the same as "Won" | "Rolled over" | informational/tertiary (not green, not red — this was a salvage, not a win) | arrow/curve icon (distinct from both check and x) |

Rationale for the fifth state: PRD explicitly distinguishes rollover-salvage from a clean win (reduced value vs full value) — collapsing "Rolled over" into "Won" would misrepresent the outcome to the user reviewing history, and collapsing it into "Lost" would hide that they took action to avoid the loss. It needs its own color and icon, not a shade of the other two.

Only one leg in a chain can be Active at a time — enforce this visually by making "Live" the only state with motion/animation, so a user glancing at a long chain can find the live leg without reading every label.

> A sixth state, **Voided**, was added by Backend after this plan was written, to cover markets that void/cancel rather than resolve (Part III §6.1). See Part IV §3 for the resolved badge treatment ("Voided, refunded," neutral gray, `Ban`/`CircleSlash` icon) — it follows the same non-color-signal rule as the five states above.

#### 2.3 The member vote (rollover authority)

Rollover authority on a regular-parlay leg is a single, unified mechanism (ADR-0003, superseding an earlier unilateral-"control" design in ADR-0002): a **persistent, stake-weighted vote restricted to that leg's formal members**. Open/non-member stakers share proportionally in the leg's eventual outcome but have no vote here — this needs to be legible without reading as unfair or broken.

**The vote UI (always this one mode — there is no separate "someone's in control" mode anymore):**
- A live, **stake-weighted tally bar**, not a headcount tally: "62% of member stake voting to roll over (need >50%)" — labeled in stake-percentage terms since that's what actually decides it, not "3 of 5 people."
- Each formal member who has staked into this leg gets their own toggle: "Vote to roll over" (persistent, not time-boxed — a member can change their vote any time while the leg is unresolved). Show each member's name, their stake weight on this leg (e.g. "Bob — 45%"), and their current vote state, so the tally's math is legible, not a black box.
- **Differentiated confirmation, based on decisiveness**: if a member's own vote would, by itself, cross the 50% threshold, their confirmation dialog must say so plainly — "Your vote alone will trigger this rollover for the entire leg, including other members' and backers' stakes." — since that's a materially bigger decision than contributing one vote among several. If their vote would only contribute toward a still-short tally, the dialog can be lighter: "Add your vote (14% of member stake) toward the 50% needed?"
- **Non-member backers see the same tally (read-only)** — no vote toggle for them, but the tally and member list should still be visible to anyone with money on the leg, since they're affected by the outcome even without a say in it. Don't hide the mechanism from them; hiding it would make the "why can't I vote" question harder to answer than just showing them the answer.
- If the tally never crosses 50%, nothing happens — the leg simply rides to its actual resolution. This is a valid, ordinary outcome, not a stalled or broken state; don't design an error/warning treatment for "vote didn't pass," since inaction is the correct default.
- Day's Parlay uses a **completely separate, unchanged vote UI** — headcount-based (one vote per backer, no stake weighting, no member restriction) — see §2.4, which layers Day's-Parlay-specific scarcity rules (one vote per backer per day, across the whole chain) on top of that different primitive. Do not reuse the regular-parlay tally bar's stake-percentage framing there; Day's Parlay's tally is a plain "N of M backers" count.

Recommend a shared component shape (`RolloverControl`) parameterized by voting mode (`stakeWeighted` for regular parlays, `headcount` for Day's Parlay) rather than two structurally different components — the visual chrome (tally bar, toggle, confirmation dialog) is the same shape in both cases; only the weighting and eligibility rules differ.

#### 2.4 Day's Parlay vote-spending (one vote for the whole day)

This is the highest-risk interaction in the whole product for accidental commitment — a backer has exactly one rollover vote across the *entire day's chain*, spendable on only one leg they've staked. Spending it forecloses voting on every other leg they've backed that day, including ones that haven't happened yet.

Design requirements:
1. **Always-visible vote status**, not just at the point of casting it — a persistent element (header of the Day's Parlay page) showing either "Your vote: unspent" or "Your vote: spent on [Leg N: market name]" with a link to that leg. This must be visible from anywhere on the page, since the constraint spans the whole day/chain, not just the leg the user is currently looking at.
2. **Confirmation step before spending**, not a single-click toggle (unlike the regular-parlay member vote in §2.3, which is freely reversible). Day's Parlay vote-spend needs an explicit confirm dialog because it's a one-shot resource: "Spend your one rollover vote on this leg? You won't be able to vote on any other leg today." Require an explicit affirmative action (not a default-focused "OK") to reduce misclick risk.
3. Once spent, the voting control on every *other* leg the user backed must show a disabled state with the reason, not just disappear: "You've already spent today's vote on Leg 3" — a missing control reads as a bug; a disabled-with-reason control reads as a rule.
4. Distinguish this from the regular multiplayer parlay's member vote (§2.3), which is per-leg, reversible, and unlimited — reuse the visual language of "vote toggle" only if you also change the copy and add the scarcity framing above. Do not literally reuse the same component without the scarcity treatment; a user who has seen the regular-parlay version may assume this one is equally low-stakes to toggle.

#### 2.5 Early rollover (stop-loss) vs. no-early-cashout

Two actions that must never be visually or spatially adjacent enough to mis-click between them, because they have opposite outcomes when a leg is losing:

- **No early cash-out to free balance**: this is simply the absence of a "cash out" button anywhere in the parlay UI. Don't build a disabled/greyed "Cash out" button as a way of communicating this rule — that implies the feature exists but is temporarily blocked. It should not exist as a control at all. If users need to be told why, a short static line under the leg ("Parlay stakes are locked until the final leg resolves") is enough; it doesn't need its own button state.
- **Early rollover (stop-loss)**: exists only on the current non-final active leg, before it resolves — but it is **not a standalone action with its own button**. Per §2.3 (ADR-0003), "roll over" only ever happens as the outcome of the leg's vote crossing its pass threshold — there is no separate unilateral "roll over now" control for anyone, including a member whose own stake would decide it alone (their vote alone crossing 50% *is* how they trigger it). What belongs here is the bestBid → next-leg-bestAsk → resulting-share-count preview described below, shown **inside the vote-cast confirmation dialog** (§2.3's `MemberVoteTallyBar`/`GroupRolloverVote` confirm step) at the moment a member or backer casts a "yes" vote — not as a separate panel with its own confirm button. Show current bestBid (what the leg would exit at) → next leg's live bestAsk (what it would buy into) → resulting share count, side by side, so whoever's voting sees the haircut versus holding to resolution before they commit their vote, exactly as if it were their own unilateral decision even though it's contingent on the tally.
- Never let this preview borrow "sell"/"cash out" language from the single-market trade panel (§1) — reuse different copy and ideally a different accent color than the single-market "Sell" button, since these are governed by entirely different rules (parlay rollover redeploys forward into the next leg, contingent on a vote passing; single-market sell is unilateral and returns to free balance) and a user pattern-matching from one screen to the other would form the wrong mental model.

---

### 3. Design tokens / visual system

Base: shadcn/ui default theme (New York or Default style — either is fine, pick one and keep it consistent; recommend Default for a slightly friendlier feel given this is a casual points game, not a finance terminal) with Tailwind's default spacing/type scale. Diverge only where called out below.

#### Color — status/state semantics
This is the one place a real system is needed beyond shadcn defaults, because the product has five leg states, plus win/loss on trades and MEAN/HOUSE distinctions, and status color needs to be consistent across every screen it appears (market cards, positions, parlay legs, Day's Parlay).

Recommended semantic roles (map to Tailwind/shadcn CSS variables, e.g. extend `--success`, `--danger`, `--live`, `--pending`, `--neutral-info` alongside shadcn's existing `--primary`/`--destructive`/`--muted`):

| Role | Suggested hue | Used for |
|---|---|---|
| `success` (green) | existing shadcn-compatible green (e.g. `emerald-600` light / `emerald-400` dark) | Won leg, realized gain, resolved-favorable |
| `danger` (red) | shadcn `--destructive` (already red) | Lost leg, realized loss, resolved-unfavorable |
| `live` (amber/blue — pick one, do not reuse green/red) | recommend a distinct blue (e.g. `blue-500`) rather than amber, since amber/yellow is close to "pending" in most people's mental model and can be misread as a warning | Active/live leg only |
| `pending` (neutral/slate) | `slate-400`/`muted-foreground` | Committed and locked, not-yet-live leg |
| `info` / rollover-salvage | a fifth distinct hue, e.g. `violet-500` | "Rolled over" state — must not be a tint of success or danger (see §2.2 rationale) |

Constraints:
- Every one of these five states must be distinguishable in grayscale/by a deuteranopia or protanopia simulation — pair each with a distinct **icon and badge shape** (outline vs solid vs dot), not color alone. This is the primary accessibility flag for the whole product (see §4).
- Keep `live` visually louder than `pending` (motion, saturation) since "what's live right now" is the single most important glanceable fact on any parlay screen.
- Do not use red/green for anything **other** than won/lost outcomes (e.g. don't also use green for "primary action" buttons) — reserve the win/loss palette exclusively for outcome semantics so it stays legible as a signal and doesn't get diluted by unrelated UI chrome.

#### Color — MEAN and HOUSE (non-status)
- MEAN row: a neutral tint (not success/danger/live/pending — it's not a state, it's a benchmark), e.g. `muted` background + a small badge, distinguishable from ordinary leaderboard rows without implying win/loss.
- HOUSE (where shown, Day's Parlay only per §1): treat as plain informational text/stat, not a badge or card competing visually with the leg states.

#### Type scale
Use Tailwind's default type scale as-is (`text-xs` through `text-3xl`). No new scale needed. Recommendation for hierarchy on data-dense screens (market cards, leg rows): question/title at `text-sm font-medium` to keep density high across 10-per-category lists and long parlay chains — this is a data-dense product, not an editorial one, so avoid oversized display type on list/browse screens; reserve larger type (`text-xl`/`text-2xl`) for single-market detail headers and page titles only.

#### Spacing
Tailwind default spacing scale, no additions. Use shadcn's default `Card`/`Table` padding conventions. One addition worth calling out: the parlay timeline (§2.1) needs a consistent left-rail width reserved for dates/state badges across every leg row so the eye can scan down a single column — treat that rail width as a fixed token (e.g. a constant in the timeline component), not ad hoc per row.

#### Components
Build from shadcn/ui primitives directly: `Card`, `Table`, `Badge`, `Tabs`, `Dialog` (for confirmations — vote-spend, member-vote rollover, roster lock), `Toast`/`Sonner` (for append-success, claim-success), `Form` + `Input` (trade stake entry). Two new composite components are justified by real product need (not aesthetic preference) and should be built as their own components rather than assembled ad hoc each time they appear:
- `LegTimeline` — the vertical ordered-leg view used identically by both regular parlay and Day's Parlay detail screens (§2.1, §2.2).
- `RolloverControl` — the vote-tally control from §2.3, parameterized by voting mode (stake-weighted for regular parlays, headcount for Day's Parlay with the scarcity variant from §2.4).

---

### 4. Accessibility flags

1. **Color-alone state signaling (highest priority)**: every leg state (pending/live/won/lost/rolled-over) and every win/loss indicator on positions/leaderboard must pair color with an icon and/or badge shape/label text — never color alone. Verify all five status hues against both light and dark theme backgrounds and against a colorblind simulation before implementation locks in the palette.
2. **Motion**: the "live" leg's pulsing/animated indicator (§2.2) must respect `prefers-reduced-motion` — provide a static-but-still-distinct alternative (e.g. a solid ring vs. a pulsing one), not just removing the cue outright.
3. **Confirmation dialogs are not decorative**: the vote-spend confirm (§2.4), the member-vote rollover confirm (§2.3, especially when a single vote is decisive), the roster-lock notice (§1 parlay creation), append/claim share-commit confirmations, and the "sell all" confirm (§1 Portfolio) are irreversible-consequence moments. Append/claim confirmations must explicitly say that committed shares are locked immediately and can be lost to HOUSE if an earlier leg fails before this leg is reached. Ensure focus moves into the dialog on open, is trapped there, and returns to the triggering element on close/cancel — standard dialog a11y, but worth flagging explicitly given how consequential these moments are.
4. **Disabled-with-reason, not silently missing controls**: per §2.4 and §2.5, controls that are unavailable due to product rules (vote already spent, no cash-out exists) must communicate *why* via visible text, not merely omit or grey out the control with no explanation — a screen-reader user hitting a disabled button with no accessible description has no way to discover the reason otherwise. Use `aria-disabled` + adjacent visible/associated (`aria-describedby`) explanatory text rather than native `disabled` with no label, so the reason is announced.
5. **Hit targets on dense list rows**: market browse cards and leg rows are data-dense; ensure primary actions (buy/sell/append/vote) meet a minimum ~44x44px touch target even when the row itself is visually compact — don't shrink interactive elements just because surrounding text is small.
6. **Semantic structure for the leaderboard**: use a real `<table>` (shadcn `Table`, which renders semantic table markup) with proper header cells so screen-reader users get row/column context, especially important for distinguishing the synthetic MEAN row from real user rows — give it an accessible label (e.g. `aria-label="Average balance across all users, not a real account"` or equivalent visible caption) rather than relying on visual styling alone to convey that distinction.
7. **Focus order on the parlay timeline**: since legs animate into position on append (§2.1), verify keyboard focus order follows the new visual (chronological) order after an insert, not the DOM's prior order — an animated reorder that isn't reflected in tab order will disorient keyboard/screen-reader users.
8. **Contrast on badges**: the five status badges (§3) must each meet WCAG AA contrast (4.5:1 for text, 3:1 for the icon/non-text graphic) against their badge background in both light and dark mode — check this explicitly for the `live` (blue) and `info` (violet) badges, which are new additions not covered by shadcn's default destructive/success tokens.
9. **Position-lot expand/collapse (§1 Portfolio)**: the group-row expand control needs `aria-expanded` reflecting current state, a real button (not a bare clickable div) so it's keyboard-operable, and focus must stay on the toggle after expanding — don't shift focus into the revealed lot list automatically, since a screen-reader user who just wanted to check "how many lots" shouldn't be dropped into a table they didn't ask to navigate yet.
10. **Live vote tally announcements (§2.3)**: the stake-weighted tally bar (`MemberVoteTallyBar`) and Day's Parlay's headcount tally must use `aria-live="polite"` on the percentage/count text so a screen-reader user perceives the tally changing in real time (e.g., another member casting a vote) without needing to re-navigate to the element — but not `aria-live="assertive"`, since a tally update isn't urgent enough to interrupt whatever the user is currently doing.

---

### Resolution status of open questions

The original version of this plan flagged four open questions. All are now resolved:

- **shadcn style variant + dark mode scope** → resolved in Part IV §0/§3: `default` style; dark mode in scope for v1.
- **Insert-animation and live-pulse motion implementation** → resolved in Part IV §0/§4.4: Framer Motion (`layout` + `AnimatePresence` for the timeline reorder; a gated `motion.div` keyframe loop for the pulse), with a `prefers-reduced-motion` fallback for both.
- **Voided/cancelled-market UI state** → resolved: Backend's fallback (Part III §6.1: flat refund, `VOIDED` terminal status) is represented as a sixth badge state in Part IV §3 ("Voided, refunded," neutral gray, `Ban`/`CircleSlash` icon — same non-color-signal treatment as the original five states).
- **Tie-breaking visibility** → confirmed no design impact, as expected; the deterministic key is `endDate ASC, gammaId ASC` (Part III §6.2).

---

## Part III — Backend Implementation Plan

Builds on Part I (Product Specification) above. Model/field/enum names below are the contract Part II and Part IV build against — flag any deviation rather than silently renaming.

Stack: Next.js API routes (App Router route handlers), Prisma + Postgres (Neon/Vercel Postgres), Auth.js Credentials provider + bcrypt, Vercel Cron.

Numeric convention: all points/prices/shares fields use Prisma `Decimal` (Postgres `numeric`), never `Float` — this is a points-economy ledger and rounding drift is unacceptable.

Auth.js note: since this is Credentials-only (no OAuth), recommend **JWT session strategy**, not the full Prisma adapter's `Account`/`Session`/`VerificationToken` tables — those exist to support OAuth linking, which this product doesn't have. Only `User` needs a `passwordHash` column. Flag this as a deliberate scope-reduction from the "standard" Auth.js + Prisma adapter setup.

---

### 1. Data model (Prisma schema outline)

#### Enums

```
Category      { POLITICS, SPORTS, CRYPTO, ESPORTS, FINANCE, TECH, CULTURE, WEATHER, MENTIONS }
PositionStatus{ OPEN, SOLD, RESOLVED_WON, RESOLVED_LOST, VOIDED_REFUNDED }
ParlayType    { STANDARD, DAYS_PARLAY }
ParlayStatus  { DRAFT, ACTIVE, SUCCEEDED, FAILED, VOIDED }
LegStatus     { PENDING, ACTIVE, RESOLVED_WON, RESOLVED_LOST, ROLLED_OVER, VOIDED }
LegStakeStatus{ PENDING, ACTIVE, RESOLVED_WON, RESOLVED_LOST, ROLLED_OVER, VOIDED_REFUNDED }
HouseTxnReason{ PARLAY_LEG_LOSS, DAYS_PARLAY_BONUS_PAYOUT }
```

`LegStatus`/`LegStakeStatus` intentionally use the five states from Part II's design (`pending/active/resolved-won/resolved-lost/rolled-over`) plus one addition, `VOIDED`, needed to cover PRD §10's voided-market risk and end-of-chain cleanup (see §6). `PENDING` now means committed and locked, not unstaked. Flag this addition explicitly to Frontend/Designer.

**Why `LegStatus` and `LegStakeStatus` are separate, not one shared enum:** under the member-vote rollover model (Part I §7, ADR-0003), a rollover or resolution always moves **every** backer's stake on a leg together — there is no scenario where one backer's stake diverges in lifecycle from the leg's own status (an earlier design's independent-rollover case for exactly 2 backers never survived past ADR-0002, itself since superseded). The two enums are kept separate anyway, purely for per-stake bookkeeping: `exitPrice`/`exitedAt` and refunded amounts are naturally per-`LegStake` fields, and denormalizing a status onto each stake avoids every read having to join up to the leg to answer "what happened to this backer's money." In practice, `LegStake.status` always mirrors its leg's `LegStatus` at the moment a leg-level transition happens.

#### Models

**User**
- `id, username (unique), passwordHash, balance Decimal @default(1000), createdAt, updatedAt`
- relations: `positions[]`, `parlaysOwned[]` (STANDARD only), `parlayMemberships[]`, `legStakes[]`, `rolloverVotes[]`, `bankruptcyGrants[]`

**HouseAccount** (singleton — one row, `id` fixed e.g. `"house"`)
- `id, balance Decimal @default(0), updatedAt`

**HouseTransaction** (audit ledger, append-only)
- `id, amount Decimal (signed), reason HouseTxnReason, parlayId?, legId?, createdAt`

**GammaEvent** (cache of a Gamma `/events` item)
- `id, gammaId (unique, Polymarket event id), category Category, title, slug, volume Decimal, active Bool, closed Bool, lastSyncedAt`

**GammaMarket** (cache of a nested market within an event; the tradable unit)
- `id, gammaId (unique, Polymarket market id), eventId (FK GammaEvent), question, outcomes Json (string[]), outcomePrices Json (Decimal[] as strings), bestBid Decimal, bestAsk Decimal, lastTradePrice Decimal, active Bool, closed Bool, resolvedOutcomeIndex Int?, endDate DateTime, volume Decimal, lastSyncedAt`

**Position** (single-market trade)
- `id, userId (FK), marketId (FK GammaMarket), outcomeIndex Int, stake Decimal, entryPrice Decimal, shares Decimal (= stake / entryPrice), committedShares Decimal @default(0), exitPrice Decimal?, status PositionStatus @default(OPEN), createdAt, closedAt?`
- `committedShares` tracks the portion of this portfolio lot locked into one or more parlay legs. Available shares for ordinary portfolio selling are `shares - committedShares` while the position is open. A fully committed lot can still appear in Portfolio, but its committed portion cannot be sold through the normal `SellPanel`.
- Settlement of single-market positions only credits or closes the **uncommitted** share portion. Committed shares are financially owned by their `LegStakeSource` rows and settle only through the parlay engine, preventing the same shares from being credited once as a portfolio position and again as a parlay stake.

**Parlay** (shared model for regular multiplayer parlays and Day's Parlay — see decision below)
- `id, type ParlayType, name String?, ownerId (FK User)?, dayKey Date? (@@unique, only set when type=DAYS_PARLAY — one row per calendar day), status ParlayStatus @default(DRAFT), rolloverCount Int @default(0), createdAt`
- `ownerId` is null for `DAYS_PARLAY` (no creator concept at all — PRD §8). For `STANDARD`, it's purely a record of who set up the roster — it confers **no** rollover authority; that's entirely governed by the member vote tally on `ParlayLeg` (see below), same as for any other member's own stake-weighted vote (ADR-0003).
- `rolloverCount` only meaningfully used/capped (at 3) for `DAYS_PARLAY`; unbounded for `STANDARD`.
- `name`: added in response to Part IV's flagged gap — the creation wizard requires naming a parlay and there's no good derived substitute (creator username isn't a name; the roster has multiple people). Schema-nullable because `DAYS_PARLAY` rows never set it (no single creator to prompt, and Part IV's Day's Parlay screens don't render a name field). `POST /api/parlays` requires `name` in the body for `STANDARD` — enforced at the API boundary, not the DB layer.
- `DRAFT` is used only for newly-created `STANDARD` parlays before leg 1 has been seeded with committed shares. Draft parlays are hidden from browse, random discovery, staking, and leaderboard discovery. Creating leg 1 transitions the parlay to `ACTIVE` in the same transaction that creates the first `ParlayLeg`/`LegStake`. `DAYS_PARLAY` rows are created directly as `ACTIVE`.

**Decision — one `Parlay` model, not two:** STANDARD and DAYS_PARLAY share ordering, JIT execution, leg/stake mechanics, and settlement code paths almost entirely. The differences (formal membership vs. claim-first-come, member-only stake-weighted vote vs. open headcount vote, the HOUSE-bonus payout) are cleanly expressible as `type`-gated branches in application logic rather than duplicated schemas/jobs. This also means the settlement/rollover cron logic in §4 is written once and shared.

**ParlayMember** (formal/invite-only roster — STANDARD only; unused for DAYS_PARLAY)
- `id, parlayId (FK), userId (FK), createdAt` — `@@unique([parlayId, userId])`. Fixed at parlay creation; no additions later (per PRD §7.1).

**ParlayLeg**
- `id, parlayId (FK), marketId (FK GammaMarket), outcomeIndex Int, status LegStatus @default(PENDING), claimedByUserId (FK User)? (who appended/claimed this leg — "formal" action for both parlay tiers), executedAt DateTime? (JIT buy timestamp), resolvedOutcomeIndex Int? (copied from market at settlement), createdAt`
- `@@unique([parlayId, marketId])` — naturally enforces "one leg claim per market" (per parlay; for Day's Parlay there's one parlay per day, so this gives "one leg per market per day" for free, satisfying PRD §8).
- No stored manual `sequence` integer. Chain order is always derived by sorting a parlay's legs by `market.endDate ASC, market.gammaId ASC` (tiebreak — see §6) at read/execution time. This matches PRD §7's requirement that order is always by resolution date regardless of add-order, and avoids renumbering on every insert/append.
- "Currently active leg" = the leg with `status = ACTIVE` (at most one non-terminal execution point per parlay chain at a time — under ADR-0003's whole-leg rollover model there is no scenario where a leg is simultaneously active for one backer and rolled over for another; every backer on a leg transitions together).
- Active-leg initialization is explicit: the first seeded leg of a `STANDARD` draft parlay becomes `ACTIVE` when it is created; the first claimed leg of a Day's Parlay becomes `ACTIVE` when it is claimed; subsequent appended/claimed legs start `PENDING` and must resolve later than the current active leg. When an active non-final leg wins or rolls over, the next sorted `PENDING` leg transitions to `ACTIVE` in the same transaction that rolls value forward.
- **`memberVoteTally` (computed, not stored)**: for any `ACTIVE` leg of a `STANDARD` parlay, `totalMemberStake = SUM(LegStake.amount)` across that leg's `status = ACTIVE` stakes held by users who are also `ParlayMember`s of this parlay (non-member stake excluded entirely), and `yesStake = SUM(...)` restricted further to members with an `active = true` `RolloverVote` on this leg. The leg rolls over the instant `yesStake > 0.5 × totalMemberStake`. Recomputed on every read and on every stake/vote/exit event that could change it — never cached or stored. Exposed on leg-detail API responses as `{ totalMemberStake, yesStake, members: [{userId, username, amount, sharePct, votingYes}] }` (see §2). Always computed over an empty/irrelevant set for `DAYS_PARLAY` legs — Day's Parlay uses a separate, plain headcount tally instead (Part I §8), not this field.

**LegStake** (aggregated per-user, per-leg committed position — supports multiple backers without exposing per-lot parlay rows)
- `id, legId (FK), userId (FK), amount Decimal (current at-risk value represented by this aggregate stake, including fresh committed principal and any rolled-forward proceeds), freshPrincipal Decimal @default(0) (immutable sum of fresh user-paid principal committed directly from portfolio positions into this leg, excluding rolled-forward proceeds), shares Decimal (total committed/rolled shares represented by this user on this leg), averageEntryPrice Decimal (weighted average across source lots or roll-forward buys), status LegStakeStatus @default(PENDING), exitPrice Decimal? (bestBid, set on early rollover), exitedAt DateTime?, createdAt, updatedAt`
- `@@unique([legId, userId])` — a user's backing on a parlay leg is merged/aggregated. If the same user commits more shares to the same leg later, update the existing `LegStake` totals and weighted average rather than creating another user-visible parlay stake row. The UI should show the aggregate; individual source portfolio lots are not pertinent to rollover display.
- A stake mirrors its leg's lifecycle: commitments on pending future legs are `PENDING` and locked; when the leg becomes live, the leg and its aggregate stakes become `ACTIVE`. This keeps pending future commitments visible and at risk without making them eligible for active-leg voting/rollover until the leg is live.
- **LegStakeSource** (mandatory internal audit/locking table): `id, legStakeId (FK), positionId (FK), committedShares Decimal, committedPrincipal Decimal, createdAt`
  - `committedPrincipal = position.stake × (committedShares / position.shares)` at commit time. This original position-principal basis is the canonical value basis for fresh commitments: it reflects points the user actually paid when buying the portfolio lot, not current market value at commit time.
  - Source rows are required, not optional. They prevent over-commit, support unlock/refund/forfeit accounting, and provide the immutable fresh-principal ledger used by Day's Parlay bonus weighting. They are backend bookkeeping, not a frontend display contract.
- Leg-level aggregate `totalShares`/`totalStaked` are computed as `SUM(LegStake.shares)` / `SUM(LegStake.amount)` for `status = ACTIVE` rows — not stored redundantly on `ParlayLeg`, to avoid drift.
- **`@@index([legId, status])`**: `memberVoteTally` (above) and the leg-level aggregates both filter `LegStake` by exactly this pair on every leg-detail read *and* on every vote cast (a synchronous, hot write-path operation per ADR-0003 — every `rollover-vote` call re-tallies), so this needs an explicit index rather than relying on the PK alone.

**RolloverVote** (the sole rollover-authority mechanism for `STANDARD` legs, member-weighted; also `DAYS_PARLAY`'s headcount vote)
- `id, legId (FK), parlayId (FK, denormalized for the cross-leg "one vote per user per day" check), userId (FK), active Bool @default(true) (persistent toggle, no timed poll — per PRD), createdAt, updatedAt`
- `@@unique([legId, userId])`. No `weight` column — a vote's stake weight is always computed live by joining to the voter's current `LegStake.amount` on that leg at tally time (Part III §1's `memberVoteTally`), never snapshotted, so it stays correct if the member adds more stake after voting.
- **`STANDARD`, app-enforced (not a DB constraint):** only users who are both a `ParlayMember` of this parlay *and* hold an `ACTIVE` `LegStake` on this specific leg may cast a `RolloverVote` here — this is what makes the vote member-restricted and stake-weighted rather than a generic per-user toggle (ADR-0003). A non-member's `POST .../rollover-vote` is rejected outright, not silently accepted with zero weight.
- **`DAYS_PARLAY`**: no membership restriction at all (there's no member tier) — every backer with an `ACTIVE` `LegStake` on the leg may vote, and the tally is a plain headcount (`> 50%` of distinct voting backers), not stake-weighted.
- **Cross-leg invariant (Day's Parlay only, app-enforced, not a DB constraint):** a user may cast at most one `RolloverVote` row across all legs of the same `parlayId`, ever. Day's Parlay votes are one-shot and irreversible, not movable toggles. Enforce transactionally by rejecting a second vote for the same user/day with `VOTE_ALREADY_SPENT`, not by flipping the old vote off.

**BankruptcyStipendGrant** (idempotency guard + audit for the daily stipend)
- `id, userId (FK), grantedOn Date, amount Decimal @default(200), createdAt` — `@@unique([userId, grantedOn])`.

**Leaderboard — explicitly not a stored model.** Ranked `rows[]` is `User.balance` ordered descending over *every* user, computed at read time — no active-user filter on ranking itself, only on MEAN (below). The synthetic **MEAN row** is `AVG(User.balance)` restricted to **active users** (Part I §5, CONTEXT.md — anyone with at least one `Position` or `LegStake` row ever), via a SQL aggregate with an `EXISTS`/`IN` filter against both tables in the same query, not a bare `AVG(balance)` over all users and not a persisted row. This active-user scoping is why MEAN needs its own query rather than being a trivial aggregate over the same `rows[]` used for ranking. Balance itself is only ever debited at buy-time and credited at sell/settlement-time, so open positions never inflate it — satisfying PRD §5's "no mark-to-market of open positions" without any extra logic.

---

### 2. API routes / server actions

All routes are Next.js Route Handlers under `app/api/`. Response/error envelope: `{ data }` on success; `{ error: { code, message, details? } }` on failure, standard HTTP status codes (`400`/`401`/`403`/`404`/`409`/`422`). **`error.code` is a stable machine-readable string** (e.g. `LEG_APPEND_TOO_EARLY`, `ROLLOVER_CAP_REACHED`, `VOTE_ALREADY_SPENT`, `MARKET_ALREADY_CLAIMED`, `INSUFFICIENT_BALANCE`) with `error.details` carrying structured fields Frontend needs to render a specific message without parsing prose — see per-route notes below and the error-shape addendum in §2.1. This resolves Part IV's flagged gap on structured rejection responses.

**Auth**
| Route | Method | Notes |
|---|---|---|
| `/api/auth/register` | POST | Custom (Credentials provider has no signup flow). `{username, password}` → bcrypt hash, create `User` with `balance=1000`. |
| `/api/auth/[...nextauth]` | GET/POST | Auth.js Credentials signin/signout/session, JWT strategy. |
| `/api/me` | GET | **Added per Part IV's flagged gap** — the ambient header balance display needs a cheap "current user" read that isn't the JWT (balance changes too often to trust a session claim). Returns `{ id, username, balance, createdAt }` for the authenticated caller (401 if unauthenticated). This is the route Frontend's `['me']` query should hit; no other route in this table is a substitute for it. |
| `/api/users?query=<username>` | GET | Username search across all users, for the parlay team roster picker. Returns a small list of `{id, username}` matches. This is intentionally discoverable by username because creating a Parlay Team requires finding any platform user. The picker displays usernames but submits stable user ids to creation routes. |

**Market browse (reads from cache only — never proxies a live Gamma call synchronously for a list view)**
| Route | Method | Notes |
|---|---|---|
| `/api/markets?category=<slug>` | GET | Top-10-by-volume cached events+markets for one of the 9 categories. Each market object includes every `GammaMarket` field named in §1 verbatim, **including `lastSyncedAt`** — needed for Frontend's staleness caption. |
| `/api/markets/:marketId` | GET | Single cached market detail (trade page). May trigger a bounded on-demand refresh — see §3. Response includes `lastSyncedAt` (post-refresh, if one occurred). Confirms Part IV's flagged gap: yes, `lastSyncedAt` is exposed here, not just on the internal DB row. |

**Trade execution**
| Route | Method | Notes |
|---|---|---|
| `/api/positions` | POST | `{marketId, outcomeIndex, stake}` → buy at live `bestAsk`. Validates `stake <= balance`, market `active && !closed`. No cap on repeat buys into the same market/outcome — dollar-cost-averaging and holding both outcomes of the same market simultaneously are both allowed; each call creates its own independent `Position` row ("lot"), never merged into an existing one. |
| `/api/positions/:id/sell` | POST | Sell the uncommitted portion of one specific position lot at live `bestBid`. Validates ownership, `status=OPEN`, market not closed, and `shares - committedShares > 0`. Backs the per-lot "sell this lot" action on both Portfolio and market detail. |
| `/api/positions/sell-all` | POST | `{marketId, outcomeIndex}` — closes every uncommitted share from every `OPEN` position the caller holds on that market/outcome in a single transaction, each at the current live `bestBid`. Committed shares locked into parlays are excluded. Backs the group-level "Sell all" action on both Portfolio and market detail. |
| `/api/positions` | GET | List caller's positions (open + closed), for portfolio view. Accepts an optional `?marketId=` filter (added during final consolidation — see Part IV §1) so the market-detail page's `SellPanel` can show all lots for that market, including different entry prices and any committed/available share split. Frontend groups the returned flat list by `(marketId, outcomeIndex)` client-side for both Portfolio and market-detail sell controls. The same response is also the canonical source for parlay commit eligibility: commit UIs filter to `status=OPEN`, matching `marketId/outcomeIndex`, and `availableShares = shares - committedShares > 0`; no separate "available lots" endpoint is required for v1. |

**Regular (STANDARD) parlay**
| Route | Method | Notes |
|---|---|---|
| `/api/parlays` | POST | `{name, inviteUserIds[]}` → creates `Parlay(STANDARD, status=DRAFT)` + fixed `ParlayMember` roster. `name` is required in the request body (see §1's `Parlay.name`). Usernames are used for search/display, but stable user ids are submitted. This call does **not** create leg 1 — Frontend's wizard still needs a second call, `POST /api/parlays/:id/legs`, to seed the chain, so it remains two round-trips overall. The draft is not discoverable or stakable until the second call succeeds. What changed under ADR-0001: that second call is no longer separable into "create the leg" then "commit shares into it" — it now requires source position commitments in the same request and atomically creates the `ParlayLeg`, mandatory `LegStakeSource` rows, and the appender's first aggregate `LegStake` in one transaction (see that route below). |
| `/api/parlays` | GET | Active parlays caller is a member of or has staked in; excludes `DRAFT`, `FAILED`, `SUCCEEDED`, and `VOIDED` unless a future history view explicitly asks for terminal parlays. Each row includes `name`, `type`, roster size, current active leg summary (`{legId, marketQuestion, endDate, status}`), chain length, and a precomputed **`cumulativeMultiplier`** (product of each executed leg's realized-or-current return along the active backer's path) — computed server-side so Frontend never needs N+1 nested-leg detail fetches just to render the browse list. This resolves Part IV's flagged gap on `ParlayCard`'s multiplier. |
| `/api/parlays/random?limit=3` | GET | Returns 3 random existing `STANDARD` parlays for the Leaderboard discovery module. Filters: `status=ACTIVE`, at least one leg, not `DRAFT`, not terminal, and currently stakable/discoverable. These are discovery cards, not leaderboard rows. |
| `/api/parlays/:id` | GET | Detail: `legs[]` **pre-sorted server-side** by `endDate ASC, gammaId ASC` (see §2.1 below — resolves Part IV's flagged gap), each leg's nested `market` object carrying `gammaId`, `endDate`, `lastSyncedAt`, `bestBid`, `bestAsk`; each leg's aggregated `stakes[]` (`LegStake` rows, one per user per leg, with `user`, `amount`, `averageEntryPrice`, `shares`, `status`); and each leg's **`memberVoteTally: { totalMemberStake, yesStake, members: [{userId, username, amount, sharePct, votingYes}] } \| null`** (§1; `null` only if the leg has never had any member stake, which shouldn't occur post-ADR-0001 since the appender is always a member) so Frontend never computes stake percentages or vote weights client-side. |
| `/api/parlays/:id/legs` | POST | `{marketId, outcomeIndex, commitments: [{positionId, shares}]}` — formal members only. **Atomically creates the `ParlayLeg`, mandatory `LegStakeSource` rows, and the caller's first aggregate `LegStake` in one transaction** (ADR-0001) by locking the requested shares from already-purchased portfolio positions. A request with no committed shares, shares from the wrong market/outcome, or more shares than the caller has available is rejected (`400`/`422`), never persisted as a stakeless leg. If this is leg 1 on a `DRAFT` parlay, the new leg becomes `ACTIVE` and the parlay becomes `ACTIVE` in the same transaction; otherwise new appended legs are `PENDING`. Validates resolution date is later than the current active leg's; rejects only the offending leg, not the whole request batch. **On rejection:** `422` with `error.code = "LEG_APPEND_TOO_EARLY"` and `error.details = { activeLegEndDate, attemptedMarketEndDate }` — structured, not prose, so Frontend can render "This market resolves before the current active leg (Jul 6) — it can't be appended here" without parsing a message string. |
| `/api/parlays/:id/legs/:legId/stake` | POST | `{commitments: [{positionId, shares}]}` — open to any user, for backers joining a leg *after* its first committed shares already exist. Only valid on the currently active leg. The API locks those shares, creates mandatory `LegStakeSource` rows, and merges them into the caller's aggregate `LegStake` for the leg. Note this does **not** grant a rollover vote unless the caller is also a formal member (ADR-0003) — non-member backers stake and share in the outcome, but never gain voting rights this way. |
| `/api/parlays/:id/legs/:legId/rollover-vote` | POST | `{vote: bool}` — **the sole rollover mechanism for `STANDARD` legs** (ADR-0003; there is no separate "unilateral control" endpoint). `403` with `error.code = "NOT_A_VOTING_MEMBER"` if the caller isn't both a `ParlayMember` and an active backer of this specific leg. Tally and execution happen synchronously on each vote cast, weighted by the voter's current stake on this leg (`Part III §1`'s `memberVoteTally`) — the instant the "yes" stake exceeds 50% of the leg's total member stake, the rollover executes immediately for the whole leg. |

**Day's Parlay** (mirrors regular parlay routes; "claim" replaces "append")
| Route | Method | Notes |
|---|---|---|
| `/api/days-parlay` | GET | Today's `Parlay(DAYS_PARLAY, dayKey=today)`; lazily created here if the midnight cron hasn't run yet (defense in depth). `legs[]` pre-sorted server-side same as regular parlays; each leg exposes a **plain headcount tally** instead of `memberVoteTally` — `{ yesCount, totalBackerCount }` — since Day's Parlay has no member tier and no stake-weighting (Part I §8). Response additionally includes `eligibleEvents[]` for the claim picker, **`myVote: { legId, marketQuestion } \| null`** (the caller's own currently-spent vote, if any), **`houseBalance: number`**, **`myContributedPrincipal: number`** (fresh user-committed principal only; rolled-forward proceeds are excluded from the bonus weighting denominator), and aggregate contribution totals needed to render "You contributed 340 of 2,100 total staked today." `eligibleEvents[]` is grouped as `{eventId, title, category, markets: [{marketId, gammaId, question, outcomes, outcomePrices, bestBid, bestAsk, endDate, lastSyncedAt, claimStatus: 'available' | 'claimed' | 'closed' | 'ineligible', claimedLegId?, claimedByUsername?, myAvailableLots: [{positionId, availableShares, entryPrice, createdAt}]}]}`. Eligible markets are active, unclosed markets from the curated tags with `endDate` inside today's UTC window; this should search all cached/synced curated-tag markets for the UTC day, not merely the top-10 browse cache. Already-claimed markets remain in the response with `claimStatus='claimed'` so the UI can explain why they are unavailable. |
| `/api/days-parlay/legs` | POST | `{marketId, outcomeIndex, commitments: [{positionId, shares}]}` — claims a market as a leg, atomically creating the `ParlayLeg`, mandatory `LegStakeSource` rows, and the claimer's first aggregate `LegStake` by locking already-purchased shares (ADR-0001, same rule as regular-parlay append). First-come-first-served, enforced by `@@unique([parlayId, marketId])`. Validates market is active, unclosed, and resolves today. If this is the first leg of the day, it becomes `ACTIVE`; later claims become `PENDING` and must resolve later than the current active leg. **On conflict:** `409` with `error.code = "MARKET_ALREADY_CLAIMED"`. |
| `/api/days-parlay/legs/:legId/stake` | POST | `{commitments: [{positionId, shares}]}` — same share-commit semantics as regular parlay staking, creating mandatory `LegStakeSource` rows and merging into the caller's aggregate `LegStake`; unlike `STANDARD`, backing here does grant a rollover vote to anyone, since Day's Parlay has no member restriction at all. |
| `/api/days-parlay/legs/:legId/rollover-vote` | POST | `{vote: true}` — plain headcount majority (`> 50%` of distinct voting backers), no stake-weighting, open to every backer of the leg (Part I §8). This is one-shot and irreversible for the user/day: the route rejects any second Day's Parlay vote by the same user for the same `parlayId`. If this vote reaches majority and the daily rollover cap has not been reached, the rollover executes immediately in this request. Rejections use structured codes: `error.code = "ROLLOVER_CAP_REACHED"` (3/day cap already hit) or `error.code = "VOTE_ALREADY_SPENT"` with `error.details = { spentOnLegId, spentOnMarketQuestion }` (cross-leg one-vote invariant). |

**Leaderboard**
| Route | Method | Notes |
|---|---|---|
| `/api/leaderboard` | GET | `{ rows: [{rank, username, balance}], mean: number }`. `rows[]` ranks *every* user, no active-user filter. `mean` is computed only over **active users** (Part III §1 — a user with ≥1 `Position` or `LegStake` ever) via a separate scoped aggregate, not a plain `AVG` over `rows[]`'s underlying set — this is the fix for a review finding that an earlier draft of this route computed `mean` over all users, contradicting Part I §5's active-user scoping. Rows are **not** pre-merged with the synthetic MEAN row — `mean` is returned as a bare number and Frontend inserts it into the rendered list at its numerically-correct position. Chosen over server-side insertion because "rank" for `rows[]` stays a clean 1..N over real users only; interleaving a synthetic row would force every row's `rank` to carry an asterisk/gap semantic that isn't needed anywhere else in the API. Does not expose `HouseAccount.balance` here — that's intentionally scoped to `/api/days-parlay` only (see above), since HOUSE's balance is only user-relevant in the Day's-Parlay-bonus context, not on the general leaderboard. |

#### 2.1 Server-side leg sorting (resolves Part IV's flagged gap)

**Legs are always returned pre-sorted server-side**, by `market.endDate ASC, market.gammaId ASC` (the tiebreak from §6.2), from both `GET /api/parlays/:id` and `GET /api/days-parlay`. Frontend does **not** need to replicate this sort client-side for rendering — `legs[]` array order is the contract. The one exception Frontend should still handle defensively: locally-held optimistic/mutated state between a mutation firing and its invalidated refetch landing should not assume a specific position for the new/changed leg (i.e., don't optimistically re-sort client-side; let the animation react to the next server-sorted response, as Part IV's own plan already does via Framer Motion's `layout` animation on invalidation).

**Field name confirmed:** the tiebreak field is **`gammaId`**, matching `GammaMarket.gammaId` in §1 exactly — Part IV's assumption was correct, no rename needed. It's included on every nested `market` object returned in a leg (`leg.market.gammaId`), not just internally.

---

### 3. Gamma caching/proxy layer

**Principle:** the browser never talks to `gamma-api.polymarket.com`. All Gamma access goes through one server-side module (`lib/gamma/client.ts`); every other route reads/writes only `GammaEvent`/`GammaMarket`.

**Two refresh paths, different TTLs:**

1. **Cron-refreshed browse cache** (steady baseline load). A sync job (can be the same cadence as settlement, e.g. every 1–5 min — PRD doesn't fix a number, recommend starting at 2 min and tuning) re-runs the 9 category discovery queries (`GET /events?tag_id=<id>&active=true&closed=false&order=volume&ascending=false&limit=10`) and upserts `GammaEvent`/`GammaMarket`. **Cost: 9 requests per tick**, trivially inside the 60/min budget. `GET /api/markets` always serves this cache directly — no client request ever triggers a Gamma call.
1a. **Day's-Parlay eligibility cache.** Because Day's Parlay needs all active, unclosed curated-tag markets resolving inside the current UTC day, not merely the top-10 browse slice, the sync layer also maintains a resolving-today eligible set for the same 9 tags. This can run less frequently or page by tag, but `/api/days-parlay` must not depend solely on the top-10 browse cache.
2. **On-demand, trade-time refresh with a short TTL.** Buy/sell/JIT execution need a live price, and a 2-minute-stale cron cache isn't good enough for fairness at the moment of trade. Before executing a buy/sell/JIT-buy, refetch that one market's price synchronously — but only if `lastSyncedAt` is older than a short TTL (recommend **5 seconds**); otherwise reuse the cached price. This collapses repeated trades on a hot market within a burst into a single Gamma call.

**Rate budget:** 9 req/min (category sync) + settlement job's per-market refreshes (bounded by count of markets with open positions/active legs, not by client traffic) + trade-time refreshes (bounded by the 5s per-market TTL, not by request volume) leaves comfortable headroom under 60/min in expected load, but is **not provably safe under a traffic spike** — see the explicit decision in §6.3.

---

### 4. Scheduled jobs (Vercel Cron)

All three jobs share a common internal engine (`lib/parlay/engine.ts`: `executeJitBuy`, `executeRollover`, `settleMarket`) so settlement and lifecycle logic isn't duplicated across cron entry points. `executeRollover` is invoked synchronously from the `rollover-vote` API route for both parlay types: stake-weighted for `STANDARD` parlays and one-user-one-vote headcount for `DAYS_PARLAY`.

#### Job A — Settlement (recommend every 5 min)
1. Collect distinct `GammaMarket` ids referenced by: `Position(status=OPEN)`, `ParlayLeg(status=ACTIVE)`, and `ParlayLeg(status=PENDING)` whose market `endDate <= now` (should already be active — catches jobs that fired late).
2. Refresh each via Gamma (rate-limiter-gated, §6.3), updating `closed`, `outcomePrices`, `bestBid`, `bestAsk`, `resolvedOutcomeIndex` if determinable.
3. For each market now `closed = true`:
   - **Determine outcome vs. void** (see §6.1 for the exact rule).
   - Settle every `OPEN` `Position` on it **only for uncommitted shares**: `uncommittedShares = shares - committedShares`. Credit `uncommittedShares × outcomePrice[held]`; leave committed shares to the parlay engine via their `LegStakeSource` rows. If `uncommittedShares = 0`, do not credit the position directly. Mark the position terminal only once both its uncommitted portion and all committed source rows have reached terminal outcomes; otherwise keep enough status/detail for Portfolio to show locked committed shares separately.
   - Settle every `ACTIVE` `ParlayLeg` on it, per-`LegStake`:
     - **Won, final leg:** credit `stake.shares × 1` to `user.balance`; mark stake `RESOLVED_WON`; once all stakes on the leg resolve, mark leg `RESOLVED_WON` and `Parlay.status = SUCCEEDED`. If `DAYS_PARLAY`, also run the HOUSE-bonus distribution (§5).
     - **Won, non-final leg — this is the rollforward trigger:** do **not** credit balance. For each `ACTIVE` `LegStake`, compute `payout = shares × 1`, fetch the next leg's market's fresh `bestAsk`, then create or update that user's aggregate `LegStake` on the next leg with the rolled-forward value (`amount += payout`, `shares += payout/freshBestAsk`, recompute `averageEntryPrice`, `status = ACTIVE`). Mark the current stake `RESOLVED_WON`. Flip next leg `PENDING → ACTIVE`, `executedAt = now`.
     - **Lost, no rollover elected before resolution:** mark active stake `RESOLVED_LOST`; transfer `stake.amount` (its current at-risk principal, not original day-1 principal) 100% to `HouseAccount` via a `HouseTransaction(reason=PARLAY_LEG_LOSS)`. Mark leg `RESOLVED_LOST`, `Parlay.status = FAILED`. For every trailing still-`PENDING` leg, mark its locked pending `LegStake`s `RESOLVED_LOST`, transfer those committed amounts to HOUSE as well, and mark the trailing legs `RESOLVED_LOST`/chain-killed rather than `VOIDED` — this is a financial loss, not cleanup, because future-leg commitments were already locked.

#### Job B — Bankruptcy stipend (daily)
1. `SELECT User WHERE balance <= 0`.
2. For each, insert `BankruptcyStipendGrant(userId, grantedOn=today)` — the `@@unique([userId, grantedOn])` constraint makes this idempotent if the job double-fires; skip on conflict.
3. On successful insert, `balance += 200`.

#### Job C — Day's Parlay lifecycle
1. **Daily boundary: 00:00 UTC (decided, Part I §8)** — create today's `Parlay(DAYS_PARLAY, dayKey=today, status=ACTIVE)` if missing. If yesterday's Day's Parlay is still `ACTIVE` with no legs ever claimed/staked, mark it `FAILED` (no money involved — trivial no-op close).
2. Rollover vote majority is **not** polled here. A Day's Parlay rollover executes immediately in `POST /api/days-parlay/legs/:legId/rollover-vote` when the vote that was just cast pushes the leg over a strict headcount majority and `Parlay.rolloverCount < 3`; the endpoint increments `rolloverCount` in the same transaction. If the cap is already reached, the vote endpoint rejects with a structured reason instead of accepting an inert vote.
3. Final-leg settlement and the HOUSE-bonus payout are handled by Job A (shared engine), gated on `Parlay.type = DAYS_PARLAY`.

#### Transaction and locking requirements

- Buy/sell/commit operations must run in database transactions. Lock the `User` row before debiting/crediting balance; lock source `Position` rows before updating `committedShares` or selling available shares.
- Commit endpoints must verify `availableShares = shares - committedShares` under lock, create `LegStakeSource` rows, update `Position.committedShares`, and upsert the aggregate `LegStake` atomically.
- Vote endpoints that can trigger rollover must lock the `Parlay` and active `ParlayLeg` rows, re-tally under the lock, and execute rollover at most once. A second decisive vote racing in after the leg has transitioned should see the terminal/new state and must not execute a second rollover.
- Settlement and HOUSE transfers must lock the affected `Parlay`, `ParlayLeg`, `LegStake`, `Position`, `User`, and singleton `HouseAccount` rows as needed so credits/debits and `HouseTransaction` rows are idempotent and balanced.

**Day boundary — resolved:** 00:00 UTC, globally, for every user — a deliberate product decision (Part I §8), not just an implementation default. Rationale: Day's Parlay is one shared, system-wide chain, so the boundary needs to be the same instant for everyone rather than sliding per viewer's local timezone. Frontend surfaces this without changing the underlying boundary (Part IV §5, item 3 — a client-side "resets at [local time]" caption).

---

### 5. Settlement & payout logic

**Single-market position:** `payout = shares × outcomePrice[heldOutcomeIndex]`, where `shares = stake / entryPrice(bestAsk at buy time)`. Naturally 0 or full value once prices collapse to 0/1. Losses evaporate — no HOUSE credit (explicit in PRD §4).

**Parlay leg settlement, per aggregate `LegStake`:**
- **RESOLVED_WON:** `payout = shares × 1`. Final leg → credit `user.balance`. Non-final leg → roll forward into the user's aggregate `LegStake` on the next leg at that leg's fresh `bestAsk` (no balance credit yet — money stays "in the chain").
- **ROLLED_OVER (early stop-loss, before actual resolution):** `payout = shares × currentBestBid` (fetched live at the moment of rollover, not at cron-cache staleness). Same forward mechanics as a win: value is redeployed into the next leg and merged into that user's aggregate stake there. Stamp `exitPrice`, `exitedAt` on the stake.
- **RESOLVED_LOST (no rollover elected before actual resolution):** `payout = 0`. 100% of `stake.amount` (current at-risk principal — which may itself be prior-leg rolled-forward proceeds, not the user's original day-1 contribution) transfers to `HouseAccount`, recorded as a `HouseTransaction`.
- Forfeiture on loss touches both the currently-`ACTIVE` leg's non-rolled stakes and every locked commitment on later `PENDING` legs in the same chain. Future legs are not empty shells; they are pending locked commitments, and a chain-killing loss sends their committed value to HOUSE.

**HOUSE crediting:** only ever from `RESOLVED_LOST` parlay-leg stakes (both `STANDARD` and `DAYS_PARLAY`) — never from single-market losses, never from rollovers (a rollover salvages value; it isn't a loss).

**Day's Parlay success payout** (final leg resolves `RESOLVED_WON`, `Parlay.status → SUCCEEDED`):
1. Standard per-stake proportional winnings, as above (compounds automatically through the `LegStake` chain).
2. **Plus** a HOUSE bonus: `bonus = 0.5 × HouseAccount.balance` (current balance at settlement time). Eligible recipients = every distinct user with at least one fresh share commitment anywhere in that day's parlay. Each recipient's share = `bonus × (their fresh committed principal for the day / all recipients' fresh committed principal for the day)`. Fresh committed principal is computed from mandatory `LegStakeSource.committedPrincipal` rows, not from aggregate `LegStake.amount`, because `amount` can include rolled-forward proceeds. Rolled-forward proceeds are deliberately excluded from this denominator so the same original stake is not counted again on later legs. This is exactly the aggregate exposed as `myContributedPrincipal` on `GET /api/days-parlay` (§2) so Frontend can render "You contributed X of Y total" without summing roll-forward `LegStake.amount` client-side. Debit `HouseAccount.balance -= bonus` (`HouseTransaction(reason=DAYS_PARLAY_BONUS_PAYOUT)`), credit each recipient's `user.balance`.

---

### 6. Resolution of PRD §10 open risks

#### 6.1 Voided/cancelled markets

> **Pre-implementation verification required** (surfaced during grilling, not yet resolved by discussion): PRD §1's "outcomePrices collapses to 1/0 on resolution" was verified against a real *binary* resolved market. The voided-market detection rule below depends on this collapse behavior holding for **multi-outcome markets** too (e.g. a 5-candidate election in one market's `outcomes[]`/`outcomePrices[]`), which has not yet been separately confirmed. Before this settlement job is built: check a real resolved multi-outcome Polymarket market's `outcomePrices` shape. If it doesn't collapse to exactly one `1` and the rest `0` across all N outcomes the way a binary market does, the detection rule below will misfire — treating a legitimately-resolved multi-outcome market as voided, incorrectly refunding real winners instead of paying them out.

**Detection:** a market is treated as **voided**, not resolved, when Gamma reports `closed = true` but `outcomePrices` do **not** cleanly collapse to `{0, 1}` per outcome (the documented resolution signal per PRD §1). This is a heuristic given the Gamma API surface described in the PRD; if a more explicit void/cancellation flag is confirmed to exist on the live API during implementation, prefer it and treat the price-collapse check as a fallback.

**Fallback rule (decision, not "last known price"):**
- **Single-market `Position`:** refund the original `stake` amount exactly (no gain, no loss), mark `VOIDED_REFUNDED`. Rejected "last known price" because a stale, non-collapsed probability is an arbitrary number that can over- or under-pay relative to what the user actually risked — a flat stake refund is the simplest rule a user will trust ("the market didn't happen, you get your points back").
- **Parlay leg, non-final:** treat as a **neutral pass-through** — same JIT-forward mechanics as a win, but using the stake's untouched `amount` as the forward-buy principal (a 0%-return leg), rather than killing the chain over an event outside any user's control.
- **Parlay leg, final:** refund each stake's `amount` directly to `user.balance`; set `Parlay.status = VOIDED` (a new terminal status, distinct from `SUCCEEDED`/`FAILED`, since the chain neither won nor lost).

#### 6.2 Tie-breaking for identical resolution timestamps
Deterministic composite sort key: **`market.endDate ASC, market.gammaId ASC`**. `gammaId` (Polymarket's own market id string) is globally unique and stable, requiring no extra data — used consistently for chain ordering (regular parlay) and leg-claim ordering (Day's Parlay).

#### 6.3 Is the caching layer alone sufficient?
**Decision: no — caching alone is not sufficient; add a rate limiter and backoff on top of it.** The steady cron baseline (9 req/min) is well within budget, but trade-time refreshes (buy/sell/JIT/rollover) are driven by client request volume, which isn't bounded by the cache design itself and could burst past 60/min under concurrent trading load. Recommended additions:
- A short (5s) per-market TTL so bursts on the same hot market collapse to one Gamma call (already in §3, doing most of the work).
- A lightweight global token-bucket limiter in front of the Gamma client wrapper (e.g., a Postgres-backed counter, since Vercel serverless functions are stateless/ephemeral) capping outbound calls to a conservative budget (e.g. 45/min) — leaving headroom for the cron jobs' baseline.
- **Graceful degradation over hard failure:** if a trade-time refetch is skipped due to the rate limiter, serve the last-cached price with its `lastSyncedAt` timestamp rather than failing the trade. This is surfaced in the UI as a subtle staleness caption — see Part IV §5, item 2.
- Exponential backoff + jitter specifically in the cron jobs (sync and settlement) so a transient Gamma `429` skips/retries one market rather than aborting the whole run.

---

### 7. Frontend coherence addendum

Resolutions to the six gaps Part IV raised, plus the bonus-proportionality confirmation. All changes are threaded into §1/§2/§5 above; this section is just a scannable index.

| # | Part IV's flag | Resolution |
|---|---|---|
| 1 | `Parlay` has no `name` field | **Added** `Parlay.name String?` (§1). Required at the API boundary for `STANDARD` creation; unused/null for `DAYS_PARLAY`. |
| 2 | Leg order: server-sorted or client-replicated? Field name for tiebreak? | **Server-sorted.** `GET /api/parlays/:id` and `GET /api/days-parlay` return `legs[]` pre-sorted by `endDate ASC, gammaId ASC`; Frontend renders array order directly, no client re-sort. Tiebreak field is **`gammaId`** — Part IV's assumption was correct as-is (§2.1). |
| 3 | No `GET /api/me` for ambient balance | **Added** `GET /api/me` → `{id, username, balance, createdAt}` (§2). |
| 4 | Does `/api/days-parlay` return `myVote` and `houseBalance`? | **Added both**, plus `myContributedPrincipal` (needed for item 6/bonus display) to the `GET /api/days-parlay` response shape (§2). |
| 5 | Is `lastSyncedAt` exposed on market API responses? | **Yes** — confirmed present on `GET /api/markets?category=` and `GET /api/markets/:marketId` responses, and on every leg's nested `market` object (§2). |
| 6 | Structured error fields for append-leg / rollover-vote rejections | **Yes** — `error.code` (`LEG_APPEND_TOO_EARLY`, `MARKET_ALREADY_CLAIMED`, `ROLLOVER_CAP_REACHED`, `VOTE_ALREADY_SPENT`, etc.) plus `error.details` carrying the specific structured fields each rejection needs (e.g. `activeLegEndDate`, `spentOnLegId`) — response envelope defined at the top of §2. |
| — | Day's-Parlay bonus: principal-contributed vs. compounded winnings | **Confirmed** — both plans independently landed on principal-contributed. No correction needed (§5). |

One further gap surfaced only after this addendum was written — Part IV's `SellPanel` needed a way to look up whether the caller holds a position on one specific market. Resolved directly in §2 above: `GET /api/positions` accepts an optional `?marketId=` filter.

**Nothing here required a product decision from the user** — all seven were implementation-contract gaps resolvable within Backend's own design authority. The one item that did need a product/PM call, unrelated to these flags — the Day's Parlay day-boundary timezone (§4) — has since been decided: **00:00 UTC, globally** (Part I §8), so every user shares the same day's chain rather than it fragmenting per local timezone.

A later grilling session surfaced further product-level corrections not captured in this addendum, tracked instead via `CONTEXT.md` and dedicated ADRs rather than a table row here, since they're domain decisions rather than implementation-contract gaps: leg creation is atomic with its first stake (ADR-0001), and rollover authority for regular parlays is a persistent, member-only, stake-weighted vote (ADR-0003, after an intermediate unilateral-control design in ADR-0002 was itself superseded). Both are threaded directly into §1/§2 above.

---

## Part IV — Frontend Implementation Plan

Builds on Part I (Product Specification), Part II (Design Plan), and Part III (Backend Plan) above. Greenfield repo — no existing frontend code or `package.json` yet, so this plan also fixes the initial stack choices needed to start the Next.js app.

Naming convention: component/prop names below use Backend's model/enum names verbatim (`Parlay`, `ParlayLeg`, `LegStake`, `LegStatus`, `LegStakeStatus`, `Position`, `ParlayType`, etc.) so a component's props map directly onto API response shapes with minimal transformation.

---

### 0. Stack decisions (greenfield setup)

- Next.js **App Router**, TypeScript.
- **Tailwind CSS + shadcn/ui**, style variant **`default`** (not New York) — matches Designer's recommendation for a "casual points game, not a finance terminal" feel. Locked, not left as a per-component choice.
- **Dark mode: in scope for v1**, `next-themes` with `class` strategy, default to system preference. Rationale: the five-state status-color system (Part II §3) is the single largest design-token investment in this product; shipping it against only one theme wastes half of Designer's token table and a `prefers-color-scheme` mismatch on a points/badge-color-heavy UI (live/pending/rolled-over) is exactly the kind of thing that looks broken if unaddressed. Cost is low (shadcn/Tailwind dark variants) relative to the badge-legibility risk Designer flagged in accessibility flag #8.
- Server state: **TanStack Query (React Query) v5**, used from Client Components. Not Next.js server-component fetch + revalidation as the primary mechanism — reasoning in §2.
- Forms: `react-hook-form` + `zod`, matching shadcn's `Form` primitive conventions (shadcn's own docs assume this pairing; no reason to deviate).
- Animation: **Framer Motion** (`motion` package) for the leg-timeline insert animation and the live-pulse indicator — reasoning in §4.4.
- Auth: Auth.js v5 (`next-auth`), Credentials provider, JWT session strategy per Backend's plan. `useSession`/middleware-based route protection for authenticated pages.

---

### 1. Component architecture

Top-level layout: `app/(app)/layout.tsx` wraps all authenticated screens with `AppShell` (nav: Markets / Portfolio / Parlays / Day's Parlay / Leaderboard, current-user balance always visible in the header — this is the one piece of "your state" that should be globally ambient since every screen's actions are bounded by it).

#### Auth
- `LoginForm` — shadcn `Card` + `Form`, fields `username`/`password`, single generic error message string (never field-specific).
- `SignupForm` — adds `confirmPassword`, inline zod validation (username taken surfaces as a field error from a 409 API response, not client-guessed).
- `StartingBalanceBanner` — dismissible, shown once on first dashboard load post-signup (local `localStorage` flag keyed by `userId`, not a server field — this is pure UI chrome, not modeled in Backend's `User`).

#### Market browse (`/markets`)
- `MarketBrowsePage` (Server Component shell — static per-request, no client state needed at this level)
  - `CategoryTabs` (client) — shadcn `Tabs`, 9 categories from PRD §1's `Category` enum (matches Backend's `Category` enum exactly — reuse the same string values, e.g. `POLITICS`, as tab values so no client-side remapping table is needed).
  - `EventList` (client, React Query) — fetches `GET /api/markets?category=<slug>`.
    - `EventCard` — expandable, one per `GammaEvent`.
      - `MarketRow` — one per `GammaMarket` in `event.markets[]`. Props: `question, outcomes, outcomePrices, bestBid, bestAsk, volume, endDate, active, closed` — named identically to Backend's `GammaMarket` fields.
    - `EventCardSkeleton` — loading state, not a spinner (Designer's call, ~10 items/category).

#### Market detail + trade panel (`/markets/[marketId]`)
- `MarketDetailPage` (Server Component: initial fetch via `GET /api/markets/:marketId` for SSR/first paint; hands off to React Query for live refresh — see §2).
  - `MarketBreadcrumb` — Category / Event / Market.
  - `MarketHeader` — question, resolution date, `active`/`closed` `Badge`.
  - `PricePanel` — bestBid ("Sell at") / bestAsk ("Buy at") side by side. Subscribes to the same polling cadence as the trade panel (§2) so both always agree.
  - `BuyPanel` (client) — stake `Input` (zod-bounded by `balance`, disables submit past ceiling per Designer's spec, not a post-submit error), outcome selector (only rendered if `outcomes.length > 2`), computed shares preview (`stake / bestAsk`), submit → `POST /api/positions`.
  - `SellPanel` (client) — rendered only if caller has an `OPEN` `Position` on this market, checked via `GET /api/positions?marketId=`. Uses a compact variant of the same grouping logic as Portfolio: group by `(marketId, outcomeIndex)`, show total shares, committed/locked shares, available shares, blended average entry price, and "current value if sold now" for available shares only (never "P&L" — Designer's explicit copy call). Expanding a group shows lots with per-lot available shares and entry prices. Actions: per-lot sell → `POST /api/positions/:id/sell`; group "Sell all available" → `POST /api/positions/sell-all` with the same confirmation pattern as Portfolio. Committed shares are visible as locked but not sellable.
  - `ResolutionBanner` — rendered when `market.closed === true`; shows `resolvedOutcomeIndex` and the position's realized payout; panel converts to read-only (BuyPanel/SellPanel unmount).
  - `PriceStalenessIndicator` — see §5 resolution on Gamma staleness.

#### Portfolio (`/portfolio`)
- `PortfolioPage`
  - `OpenPositionsTable` — `Position` rows where `status = OPEN`, grouped client-side by `(marketId, outcomeIndex)` into `PositionGroupRow` (Part II §1): blended average entry price (`totalStake / totalShares` across the group's lots), total shares, current value at bestBid, and a group-level "Sell all" button. Per Designer's review, "Sell all" opens a `Dialog` confirming the scope before firing `POST /api/positions/sell-all` — "Sell all 3 purchases of this position — 428 shares total?" — since it can silently include lots the user forgot they held (accessibility flag #3). Each `PositionGroupRow`'s expand control is a real `<button>` with `aria-expanded` reflecting state (not a bare clickable div), keyboard-operable, and focus stays on the toggle after expanding rather than jumping into the revealed list (accessibility flag #9). Expanding reveals `PositionLotList` → individual `PositionLotRow`s — entry price, shares, `createdAt` — each with its own "Sell this lot" button → `POST /api/positions/:id/sell` (no confirmation dialog needed here — a single, already-legible action, unlike "sell all"). A group with exactly one lot can render the expand control disabled/hidden (nothing to drill into), but still uses the same component — no separate "single position" component needed.
  - `SettledPositionsTable` — `status IN (RESOLVED_WON, RESOLVED_LOST, VOIDED_REFUNDED)`, same grouped/expandable treatment as `OpenPositionsTable` for consistency (reuses `PositionGroupRow`/`PositionLotList`, just with no sell actions and outcome/points-realized columns instead): market, side, stake, outcome, signed points realized per lot, with a group-level total. `VOIDED_REFUNDED` renders a neutral "voided — refunded" pill, not won/lost coloring.
  - `MyParlaysSummary` — thin list of `Parlay` (both types) the user has a `LegStake` or `ParlayMember` row in, each linking out to `/parlays/:id` or `/days-parlay`. Explicitly does not render leg detail (Designer's call) — just `{type, currentActiveLeg summary, chain length}`.

#### Leaderboard (`/leaderboard`)
- `LeaderboardPage`
  - `LeaderboardTable` — real shadcn `Table` (semantic markup, accessibility flag #6). Rows from `GET /api/leaderboard` → `{rows: [{rank, username, balance}], mean}`.
    - `MeanRow` — inserted client-side into the rows array at its numerically-correct position (`mean` compared against `balance` values, not a server-provided rank — confirmed by Backend, Part III §2: `mean` is returned as a bare number and Frontend owns the insertion; the rows array stays a clean 1..N over real users only).
    - Current user's row gets a left-border accent class via a `username === session.user.username` check.
  - `RandomParlaysModule` — separate discovery section below or beside the table, backed by `GET /api/parlays/random?limit=3`. Renders `ParlayCard` summaries only; these cards are not ranked rows and should not visually compete with MEAN or user rank.

#### Regular parlay — browse (`/parlays`)
- `ParlayBrowsePage`
  - `ParlayCard` — per `Parlay(type=STANDARD)`: `name` (confirmed added to the schema, Part III §7 item 1), roster size (`ParlayMember` count), current active leg summary, chain length, cumulative multiplier (confirmed precomputed and returned by `GET /api/parlays`, Part III §2 — no client-side computation or N+1 detail fetches needed).

#### Regular parlay — creation (`/parlays/new`)
- `CreateParlayWizard` (client, 2-step, local `useState` step index — this is transient wizard state, not global):
  1. `RosterStep` — parlay name input, searchable user picker (`UserCombobox`), explicit static copy: "Members can't be added later — only added members can append legs." The combobox fetches `GET /api/users?query=` and stores `{id, username}` selections; submit sends `inviteUserIds[]`, not usernames. No confirm dialog needed here per Designer (it's a form step, not a destructive action-in-place), but the copy itself carries the warning.
  2. `FirstLegStep` — market/outcome picker (reuses `MarketRow`-style selection) + `EligiblePositionCommitSelector`, a reusable control that fetches `GET /api/positions?marketId=<marketId>`, filters to selected `outcomeIndex`, `status=OPEN`, and `availableShares = shares - committedShares > 0`, then lets the user choose concrete lots and share quantities to commit. It never exposes `LegStakeSource` rows or promises source-lot inspection after commit; source lots are only shown before commit to explain what will be locked. Submit fires `POST /api/parlays` then `POST /api/parlays/:id/legs` with `{marketId, outcomeIndex, commitments: [{positionId, shares}]}` in sequence, under a single loading state — two round-trips overall (confirmed by Backend, Part III §2), but the second call atomically creates the leg and locks its first aggregate stake together, not as two further separable steps.

#### Regular parlay — detail (`/parlays/:id`) — the hard screen
Covered in depth in §4.1–4.3. Component list:
- `ParlayDetailPage`
  - `LegTimeline` (shared composite component, also used by Day's Parlay)
    - `LegTimelineRow` per `ParlayLeg`, rendered in the array order returned by `GET /api/parlays/:id` — legs arrive **pre-sorted server-side** by `market.endDate ASC, market.gammaId ASC` (confirmed by Backend, Part III §2.1), so Frontend does not replicate this sort client-side except defensively for locally-held optimistic/in-flight state (§4.1).
      - `LegStatusBadge` (props: `status: LegStatus`, one of the 6 values incl. `VOIDED`)
      - `LegBackerList` — per aggregate `LegStake`, shows `user, amount, averageEntryPrice, shares, status: LegStakeStatus`; it does not show source portfolio lots.
      - `RolloverControl` (props: `votingMode: 'stakeWeighted'`, `memberVoteTally: {totalMemberStake, yesStake, members: [...]}`, `callerStake`, `nextLegMarket`, `legStatus`, `isFinalLeg`) — §4.3
      - `AppendLegForm` — visible only if `session.user` is in `parlay.members[]`; requires selecting eligible portfolio lots and share quantities through `EligiblePositionCommitSelector` alongside the market/outcome pick (§4.1); shows the locked-commitment/HOUSE-loss warning before submit; inline rejection error if append validation fails
  - `ActiveLegStickyMarker` — sticky-positioned "you are here" indicator tied to whichever leg has `status = ACTIVE`.

#### Day's Parlay (`/days-parlay`)
- `DaysParlayDashboardCard` — dashboard-embedded summary ("Leg 3 of 7, live now: ...").
- `DaysParlayPage`
  - `VoteStatusHeader` (sticky/persistent) — "Your vote: unspent" or "Your vote: spent on Leg N: <market>" with jump link. Backed by `myVote: {legId, marketQuestion} | null` on `GET /api/days-parlay`, confirmed added by Backend (Part III §2/§7) specifically so this header doesn't need a second query.
  - `RolloverCounter` — "1 of 3 rollovers used today", from `parlay.rolloverCount`.
  - `HouseBalanceStat` — plain text stat, this screen only: "HOUSE balance: X — 50% (Y) is today's bonus pool." Backed by `houseBalance` on `GET /api/days-parlay` (confirmed added by Backend, Part III §2/§7, and intentionally **not** exposed on `/api/leaderboard`, matching Designer's scoping).
  - `LegTimeline` (reused component)
    - `ClaimLegAction` — driven by `eligibleEvents[]` from `GET /api/days-parlay`; renders event-grouped markets with `claimStatus`, prices, end date, claimed leg/user details, and `myAvailableLots` for the selected outcome. On claim submit, immediately gray out the claimed market in the "available markets" picker before server confirmation; reconcile/rollback on 409 (already claimed). Requires selecting eligible portfolio lots and share quantities in the same claim action, same atomic committed-shares rule as regular-parlay append (ADR-0001), and shows the Day's-Parlay-specific warning that other users' earlier legs can kill the chain before this committed leg is reached.
    - `LegBackerList` — the same component used on the regular-parlay screen (§1 above); Day's Parlay has no separate naming, backer is one unified concept everywhere.
    - `RolloverControl` in its Day's-Parlay variant — `votingMode: 'headcount'`, backed by `{ yesCount, totalBackerCount }` instead of `memberVoteTally` (Part I §8, Part III §2) — a structurally identical component shape, different weighting/eligibility rules entirely.
    - `VoteSpendButton` — §4.4

---

### 2. State management approach

**Split: server state via React Query; local/UI state via component `useState`/`useReducer` (no global client store like Redux/Zustand — nothing in this product needs cross-tree client state that isn't either server data or single-screen wizard/animation state).**

#### Server state (React Query)
Rationale for React Query over server-component-only fetching: several screens (trade panel, parlay detail, Day's Parlay) need **client-side polling** for live prices/leg status while the user sits on the page, plus **optimistic updates** (claim-a-leg, vote-spend) with rollback — both are React Query's core strengths and awkward to hand-roll with pure RSC + `revalidatePath`. Initial page load still uses a Server Component for the first fetch (fast first paint, SEO is irrelevant here but TTFB matters for a data-dense list), hydrated into React Query's cache via `HydrationBoundary` so the client takes over seamlessly for subsequent refetches — standard Next.js + RQ pattern, avoids a double-fetch on load.

Query key structure (flat, resource-scoped):
- `['markets', category]` — `GET /api/markets?category=`
- `['market', marketId]` — `GET /api/markets/:marketId`
- `['positions']` — `GET /api/positions`
- `['positions', {marketId}]` — `GET /api/positions?marketId=` for market-detail selling and parlay commit eligibility
- `['parlays']` / `['parlay', id]`
- `['parlays', 'random']` — `GET /api/parlays/random?limit=3`
- `['days-parlay']`
- `['leaderboard']`

Polling/staleness intervals, deliberately tied to Backend's 5s trade-time cache TTL so the UI never implies more freshness than the backend actually guarantees:
- **Market detail trade panel** (`['market', marketId]`): `refetchInterval: 5000` while the tab is visible (`refetchIntervalInBackground: false`), matching Backend's per-market TTL exactly — polling faster would just re-serve the same cached price and waste a request against the token-bucket limiter; polling slower would let the displayed price lag behind what a trade would actually execute at.
- **Parlay/Day's Parlay detail** (`['parlay', id]`, `['days-parlay']`): `refetchInterval: 5000` as well — the active leg's live price and any rollover-vote tally changes need the same freshness bar as a trade panel, since the active leg *is* effectively a live trade panel.
- **Market browse list** (`['markets', category]`): `refetchInterval: 60000` (1 min) — this reads from the cron-refreshed cache (Backend refreshes every 1–5 min), so sub-minute polling buys nothing; also `staleTime: 30000` to dedupe re-renders on tab switches.
- **Portfolio/positions/leaderboard**: no polling; `staleTime: 15000`, refetch on window focus (RQ default) and after any mutation that touches them (invalidate `['positions']` after buy/sell, invalidate `['leaderboard']` — well, leaderboard changes only on realized settlement, which is cron-driven, so also give it a light `refetchInterval: 30000` on the leaderboard page only, not globally).
- All mutations (`POST /api/positions`, `.../sell`, `.../sell-all`, `.../stake`, `.../rollover-vote`, `.../legs`) use RQ `useMutation` with `onSuccess` invalidating the relevant query key(s) — e.g. committing shares to a leg invalidates `['parlay', id]`/`['days-parlay']` plus the relevant `['positions', {marketId}]` and `['positions']` keys so locked shares disappear from sellable/committable availability; `sell-all` invalidates `['positions']` and `['positions', {marketId}]` (the whole group re-renders from the refetched flat list, same client-side grouping logic as initial load — no special-case merge of an optimistic partial result).

#### Client/local UI state
- **Vote-spend confirmation flow** (§4.4): local `useState` in `VoteSpendButton` for dialog open/closed; the actual spend is a mutation, not stored client state — once submitted, truth lives server-side and the header re-renders from the invalidated `['days-parlay']` query. No client-side "optimistic vote" faking, because a failed/rejected vote (e.g. cap already hit) must not flash a false-positive spent state. Backend's structured `error.code` values (`ROLLOVER_CAP_REACHED`, `VOTE_ALREADY_SPENT` with `error.details.spentOnLegId`, confirmed in Part III §2/§7) let the dialog show the specific reason rather than a generic failure toast.
- **Leg-timeline insert-animation state**: handled by Framer Motion's layout animation (`layout` prop + `AnimatePresence`) keyed by `legId`, not manually tracked state — see §4.4 (motion decision).
- **Multi-step parlay creation wizard**: local `useState<step>` in `CreateParlayWizard` for form state, plus the server-side `DRAFT` parlay created by `POST /api/parlays` before leg 1 is seeded. If the second step fails or the user abandons the flow after creating the draft, the draft remains hidden from discovery/staking and can be resumed by that creator or cleaned up by a later maintenance job; it must never appear as an active empty parlay.
- **Optimistic claim-a-leg UI**: RQ's built-in `onMutate` optimistic update (mutate the cached `['days-parlay']` market-availability list immediately, roll back `onError`) rather than bespoke local state — this is exactly the optimistic-update pattern RQ is built for.
- **Eligible position commits**: local form state tracks selected `commitments[]` in `EligiblePositionCommitSelector`, bounded by `availableShares` from `GET /api/positions?marketId=` or `myAvailableLots` on `GET /api/days-parlay`. The source-lot selection is discarded after submit; post-commit parlay screens show only aggregate `LegStake` rows.
- **Global user balance display**: derived from `session` (Auth.js JWT, refreshed via `useSession` re-poll on window focus) is *not* used for balance — balance changes too often (every trade) to trust a JWT claim. Instead pull current balance from a lightweight `['me']` query (`staleTime: 5000`, invalidated on every mutation that could change balance: buy, sell; settlement-driven leaderboard refresh doesn't apply since only cron changes balance and there is no need to poll for that within a session), hitting `GET /api/me` — confirmed added by Backend specifically for this purpose (Part III §2/§7).

---

### 3. Design tokens / style implementation notes

Confirms Designer's token table (Part II §3) as source of truth; this section only fixes the *values* Designer left as "pick one":

- shadcn style: **`default`** (not New York) — see §0.
- Dark mode: **in scope**, `next-themes`, `class` strategy — see §0.
- CSS variables added on top of shadcn defaults (Tailwind config / `globals.css`), matching Designer's five-role table:
  - `--success` → `emerald-600` (light) / `emerald-400` (dark)
  - `--danger` → shadcn's existing `--destructive` (reused, not duplicated)
  - `--live` → `blue-500` (light) / `blue-400` (dark)
  - `--pending` → `slate-400` / `--muted-foreground`
  - `--info` (rolled-over) → `violet-500` (light) / `violet-400` (dark)
- Each `LegStatusBadge` variant pairs color with: `pending` = dashed outline + lucide `Lock` plus `Clock` (label "Pending, locked"), `live` = solid + pulsing dot + lucide `Radio`/`Activity`, `won` = solid + `Check`, `lost` = solid + `X`, `rolled-over` = solid + `CornerUpRight` (curve/arrow, distinct from check/x), `voided` (Backend's 6th state) = outline + `Ban`/`CircleSlash` icon, neutral gray, labeled "Voided, refunded." This voided variant is the resolution to Designer's punted 6th-state question (Part II, Resolution status section).
- Badge contrast checked against both themes at implementation time per accessibility flag #8 — flagging as a required manual QA step before this ships, not something resolved by token choice alone.

---

### 4. Implementation of the 5 hard interaction problems

#### 4.1 Leg ordering / append-insert animation

- **Sort source of truth**: Frontend never stores or computes its own leg order independently of Backend's derived sort (`market.endDate ASC, market.gammaId ASC`). `GET /api/parlays/:id` and `GET /api/days-parlay` return `legs[]` **pre-sorted** in this order, confirmed by Backend (Part III §2.1) — no client-side re-sort logic for rendering.
- `LegTimeline` renders `legs[]` in array order directly — no client re-sort logic, keyed by `leg.id`.
- **Insert animation**: on `AppendLegForm` success, the mutation's `onSuccess` invalidates `['parlay', id]`; when the new `legs[]` array comes back with the new leg inserted at its computed index, Framer Motion's `<motion.div layout>` + `<AnimatePresence>` (wrapping the mapped list, each row a `motion.div` with `layout` and a stable `key={leg.id}`) animates every row that shifted position to its new slot automatically — this is exactly Framer Motion's layout-animation feature, no manual "compute where it goes and animate" code needed. Duration `0.3s`, `ease: "easeOut"`. Respects `prefers-reduced-motion` via Framer Motion's `useReducedMotion()` hook — when true, disable `layout` transition duration (set to `{duration: 0}`) so the reorder is instant, not skipped-and-confusing.
- **Rejected append**: inline `FormMessage` under the market-picker field in `AppendLegForm`, not a toast — error text interpolates the conflicting date from the API error response, e.g. "This market resolves before the current active leg (Jul 6) — it can't be appended here." Backed by Backend's structured `422`/`error.code = LEG_APPEND_TOO_EARLY` response with `error.details = {activeLegEndDate, attemptedMarketEndDate}` (Part III §2), so Frontend doesn't parse a prose string to build this message.
- **Sticky active-leg marker**: `ActiveLegStickyMarker` uses CSS `position: sticky` scoped to the timeline's scroll container (not the page), keyed off whichever leg has `status === 'ACTIVE'` in the current `legs[]` array — no separate query needed.
- **Focus order** (accessibility flag #7): since rows are keyed by `leg.id` and Framer Motion's `layout` animates the *visual* position of the same DOM node (not remounting/reordering the DOM), the DOM order must independently match the visual order after invalidation — enforced by rendering `legs[]` in the already-sorted array order (per the sort-source-of-truth point above), so tab order and visual order agree at every step, not just after animation settles.

#### 4.2 JIT execution state machine per leg

- `LegStatusBadge` is a pure presentational component: `props: { status: LegStatus }` (or `LegStakeStatus` for a per-backer row — note these are two different enums per Backend, so `LegStatusBadge` is reused for both, since the visual vocabulary — pending/active/won/lost/rolled-over/voided — is identical across the two enums' value sets by design).
- Live-state polling: leg status changes are cron-driven server-side (Job A), so the client only needs to notice the transition — this is exactly what the 5s `refetchInterval` on `['parlay', id]` / `['days-parlay']` (§2) is for. No websocket/SSE needed; a 5s poll matches Backend's own settlement cadence closely enough that sub-5s push infrastructure would be over-engineering for this product's stakes.
- Only one row renders the pulsing/motion treatment at a time, driven purely by `status === 'ACTIVE'` — no separate "is this the one true active leg" client computation, trusting Backend's invariant that at most one leg is ever `ACTIVE`.

#### 4.3 The member vote (rollover authority)

- `RolloverControl` component, props: `{ legId, parlayId, votingMode: 'stakeWeighted' | 'headcount', memberVoteTally?: {totalMemberStake, yesStake, members: [{userId, username, amount, sharePct, votingYes}]}, headcountTally?: {yesCount, totalBackerCount}, callerStake?: {amount, shares, sharePct}, currentLegMarket: {bestBid, lastSyncedAt}, nextLegMarket?: {bestAsk, lastSyncedAt}, isFinalLeg, legStatus }`. `callerStake`, `currentLegMarket`, and `nextLegMarket` are required whenever the control can open a stop-loss preview; they may be derived by the parent from the already-sorted `legs[]`, but must be passed explicitly so the component does not reach into global state. One render path per mode — **not** a single generic vote button with conditional copy, since the weighting math genuinely differs (ADR-0003 replaced an earlier two-branch "controller vs. vote" design, ADR-0002, with this single-branch-per-mode shape):
  - `votingMode === 'stakeWeighted'` (regular parlay, always this mode — never a separate "someone's in control" branch): renders `MemberVoteTallyBar` — a live percentage bar ("62% of member stake voting to roll over — need >50%", `aria-live="polite"` per accessibility flag #10 so the percentage announces on change) plus one row per member with a stake on this leg (`username`, `sharePct`, a toggle for `session.user.id`'s own row, read-only for others' rows). Toggling casts `POST /api/parlays/:id/legs/:legId/rollover-vote` with `{vote: true/false}`. **Confirmation dialog copy branches on decisiveness**, computed client-side from the prop (`callerShare + currentYesStake > 0.5 × totalMemberStake` when casting a "yes"): if the caller's own vote would cross the threshold by itself, show "Your vote alone will trigger this rollover for the entire leg, including other members' and backers' stakes."; otherwise, "Add your vote (`sharePct`% of member stake) toward the 50% needed?". **For a "yes" vote on a non-final leg, this same dialog also shows the stop-loss preview** (Part II §2.5) — current `bestBid` (exit price) → next leg's live `bestAsk` (entry price) → resulting share count (`shares = (callerStake.shares * bestBid) / nextLegBestAsk`), side by side — since ADR-0003 means "roll over" only ever happens as the outcome of this vote passing; there is no separate stop-loss control anywhere (see §4.5). Non-member backers and members with no stake on this specific leg see the tally bar and member list **read-only** — no toggle rendered for them at all (not disabled — per Designer's "don't render a disabled control for a non-feature" instruction, since they structurally have no vote here, not a withheld one).
  - `votingMode === 'headcount'` (Day's Parlay, always this mode): renders a **read-only** live tally display — "3 of 5 backers voted... (needs 3 to pass)", `aria-live="polite"` per accessibility flag #10 — but **no toggle of its own**. Casting the actual vote is never a freely-reversible action here (unlike the regular-parlay member vote): per Part I §8, each backer gets exactly **one** rollover vote to spend across the *entire day*, not a per-leg toggle they can change at will, so `RolloverControl` in this mode always defers the cast action to `VoteSpendButton` (§4.4), which owns the one-shot confirm-dialog flow (including the same stop-loss preview as the stake-weighted mode, on a "yes" vote for a non-final leg). Open to every backer — no member-eligibility gate, since Day's Parlay has no member tier.
  - `isFinalLeg === true`: `RolloverControl` renders nothing at all in either mode (not disabled) — no early rollover exists on the final leg per PRD, and no early cash-out control exists anywhere (Designer's explicit "don't render a disabled button for a non-feature" instruction applies here too).
- There is no cross-parlay-type sharing of tally state or component instance — a given `RolloverControl` render is always fixed to one `votingMode` for its entire lifetime (a regular-parlay leg is never headcount-tallied and vice versa), so there's no "live transition between modes" concern to design for, unlike the superseded ADR-0002 design.

#### 4.4 Day's Parlay vote-spending (one vote for the whole day)

- `VoteStatusHeader` — persistent, page-level (not per-leg), reads `myVote` from the `['days-parlay']` query (confirmed added by Backend, Part III §2/§7). Renders "Your vote: unspent" or "Your vote: spent on Leg N: <market>" + jump-link (`<a href="#leg-{legId}">` scrolled via native anchor, since `LegTimelineRow` ids are stable).
- `VoteSpendButton` (rendered inside `LegTimelineRow` for legs the caller has backed): on click opens a shadcn `Dialog` — **not** a toggle — with explicit copy "Spend your one rollover vote on this leg? You won't be able to vote on any other leg today." For a non-final leg, this dialog also shows the stop-loss preview described in §4.3 (bestBid → next-leg-bestAsk → resulting shares) — the caller's vote here can still be the one that crosses the headcount threshold, so they should see the same trade-off a stake-weighted voter would. Confirm button is the sole affirmative action (no default-focused OK; shadcn `Dialog`'s default focus goes to the first focusable element, which Frontend must explicitly set to the Cancel/neutral action, not Confirm, to reduce misclick risk per Designer's spec).
- On confirm: `useMutation` → `POST /api/days-parlay/legs/:legId/rollover-vote` with `{vote: true}`. On success, invalidate `['days-parlay']` — this flips `myVote` globally. The leg the user voted on re-renders as a non-interactive "Vote spent here" state with the market/leg name and no retract/toggle affordance. Every other backed leg re-renders as disabled-with-reason (`aria-disabled` + `aria-describedby` pointing to visible text "You've already spent today's vote on Leg 3" per accessibility flag #4), driven purely by `myVote.legId !== thisLeg.id && myVote !== null`, no separate client-side "spent" flag needed.
- This is **explicitly a different component** from `GroupRolloverVote` in §4.3 (not the same component with a scarcity prop) — Designer's instruction was "don't literally reuse the same component without the scarcity treatment," and since the interaction shape also differs (confirm-dialog vs. free toggle, one-shot vs. reversible), splitting them into two components rather than one component with a `mode` prop keeps each one's logic simple and prevents a future edit to the reversible-vote path from accidentally touching the one-shot path.

#### 4.5 Early rollover (stop-loss) vs. no-early-cashout

- No-cashout: literally absent. There is no `CashOutButton` component anywhere in the parlay tree. A static `<p>` line renders under any non-final leg: "Parlay stakes are locked until the final leg resolves." — not a component, just copy inline in `LegTimelineRow`.
- Stop-loss: **there is no standalone `EarlyRolloverPanel` component** — an earlier draft of this plan had one, but it doesn't survive ADR-0003: "roll over" only ever happens as the outcome of a passed vote, so there is no separate unilateral control for anyone to click, including a member whose vote alone would decide it. The bestBid → next-leg-bestAsk → resulting-share-count preview lives **inside** `RolloverControl`'s vote-cast confirmation dialog instead (§4.3, and `VoteSpendButton`'s dialog for Day's Parlay, §4.4) — never a separate panel with its own confirm button.
- The preview, wherever it's shown, stays visually and spatially separated from `SellPanel` (single-market sell, §1): different dialog, different screen context (parlay detail vs. market detail), different copy ("Roll over now at current price" vs. "Sell") so no shared visual vocabulary invites a false pattern-match between the two flows — `SellPanel`'s sell button keeps its neutral `variant="secondary"`, while the parlay vote-confirm dialogs use a distinct `--info`/violet accent tying visually to the "rolled over" badge color they produce.

---

### 5. Resolutions to open questions

#### Backend's 3 flagged questions

1. **Day's-Parlay bonus proportionality — confirm principal-contributed reading.** Frontend agrees: display and promise the bonus as proportional to **fresh principal contributed** (sum of mandatory `LegStakeSource.committedPrincipal` rows a user personally put in that day), matching Backend's implementation. Reasoning: a compounded-winnings reading would make the bonus payout opaque and hard for users to predict or verify from the UI (it would depend on the exact chain of entry/exit prices across legs they may not have been staked in), whereas "your share of the bonus pool is proportional to how much you personally put in" is a single legible number the UI can show plainly. UI implication: `HouseBalanceStat`/an eventual payout breakdown should show a user's contributed-principal total explicitly (e.g. "You contributed 340 of 2,100 total staked today → your share of the bonus pool: 16%") rather than implying anything about compounded winnings feeding the bonus math. Backed by `myContributedPrincipal` on `GET /api/days-parlay`, confirmed added by Backend (Part III §2/§5/§7) — this is a derived aggregate Frontend does not need to compute by summing aggregate `LegStake.amount` client-side.

2. **Gamma price staleness — yes, surface it, subtly.** Add `PriceStalenessIndicator` to the trade panel (`MarketDetailPage`) and to any active-leg price display in `LegTimeline`, including inside the `RolloverControl`/`VoteSpendButton` vote-cast dialogs' stop-loss preview (§4.3/§4.4): a small muted-text caption "Price as of Xs ago" next to `bestBid`/`bestAsk`, computed client-side as `now - lastSyncedAt` (Backend's field, already in `GammaMarket`, confirmed present on `GET /api/markets/:marketId` and every leg's nested market object per Part III §2) and re-rendered on each poll tick. Threshold: only show it at all once staleness exceeds ~6 seconds (i.e., one missed refresh cycle beyond the 5s TTL) — below that it's indistinguishable from "live" and would just add visual noise to every price on the page. This directly surfaces Backend's §6.3 backoff/graceful-degradation behavior (serving last-cached price on rate-limiter skip) without treating it as an error state — no toast, no warning color, just a quiet timestamp caption.

3. **Day's Parlay UTC day-boundary — confirmed, needs a user-facing affordance.** 00:00 UTC, globally, is the decided boundary (Part I §8) — chosen specifically so every user worldwide shares the same day's chain rather than each timezone getting its own rolling window. Frontend will not change the underlying boundary but will make it legible: `DaysParlayPage` and `DaysParlayDashboardCard` both show a small caption under the "today's chain" heading: "Resets at [midnight UTC, converted to viewer's local time via `Intl.DateTimeFormat`] your time" — computed purely client-side from a fixed UTC-midnight constant, no new API field needed. This avoids a confused user in, say, UTC+9 wondering why "today's" Day's Parlay rolled over mid-afternoon their time. Rendered once, not repeated per-leg.

#### Designer's 2 punted decisions

4. **shadcn style variant + dark mode scope**: `default` variant; dark mode **in scope for v1** via `next-themes`. See §0/§3 for full reasoning — the size of the custom status-color token investment justifies covering both themes now rather than retrofitting dark mode later once five badge colors are hand-tuned against only a light background.

5. **Motion/transition implementation**: **Framer Motion** (`motion` npm package) for both the leg-insert reorder animation (`layout` + `AnimatePresence`, §4.1) and the live-pulse indicator (a `motion.div` with an infinite `scale`/`opacity` keyframe loop, gated by `useReducedMotion()` — falls back to a static high-contrast ring per Designer's accessibility flag #2, not a removed cue). Rationale for Framer Motion specifically over CSS-only transitions: the insert animation requires *layout* animation (rows shifting to new flex/grid positions as the array reorders), which plain CSS transitions can't express without manual FLIP-technique position math — Framer Motion's `layout` prop provides this natively and is the standard choice for exactly this "list reorders, animate the reflow" pattern in the React ecosystem. The live-pulse alone could be CSS-only, but using the same library for both keeps one animation dependency in the project rather than two different mechanisms for adjacent problems on the same screen.

---

### 6. Routing / page structure (Next.js App Router)

```
app/
  (auth)/
    login/page.tsx
    signup/page.tsx
  (app)/                          # authenticated shell, layout.tsx = AppShell (nav + balance)
    layout.tsx
    dashboard/page.tsx            # post-login landing: StartingBalanceBanner (first load only),
                                   # DaysParlayDashboardCard, quick links
    markets/
      page.tsx                    # MarketBrowsePage — CategoryTabs + EventList
      [marketId]/page.tsx         # MarketDetailPage — PricePanel/BuyPanel/SellPanel/ResolutionBanner
    portfolio/page.tsx            # OpenPositionsTable / SettledPositionsTable / MyParlaysSummary
    leaderboard/page.tsx          # LeaderboardTable + MeanRow
    parlays/
      page.tsx                    # ParlayBrowsePage
      new/page.tsx                # CreateParlayWizard
      [id]/page.tsx               # ParlayDetailPage (LegTimeline)
    days-parlay/
      page.tsx                    # DaysParlayPage (single system-wide view, no [id] segment —
                                   # route resolves "today" server-side via session-independent
                                   # GET /api/days-parlay, no client-supplied date param)
  api/
    ...                           # Backend-owned route handlers, not part of this plan
```

Notes:
- `days-parlay` has no dynamic segment because there is exactly one active row at a time (Backend's `dayKey`-keyed singleton-per-day model) — the route always means "today's," matching Designer's "no browse, there's only one" screen inventory note.
- `(auth)` and `(app)` are route groups only (no URL segment), separated so `(app)/layout.tsx` can gate on session via middleware (`middleware.ts` redirecting unauthenticated requests to `/login`) without touching the auth pages' layout.
- No `[category]` dynamic segment on `/markets` — category is a query param (`?category=politics`) driving `CategoryTabs` client state, not a route param, since switching categories shouldn't trigger a full route transition/loading skeleton flash; it's an in-page tab switch backed by a fresh React Query key.
