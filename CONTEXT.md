# Points Prediction Market

A points-based prediction market where users trade mock positions on real Polymarket markets and build chained "parlay" bets, competing on an all-time leaderboard. No real money.

## Language

**Backer**:
A user who has staked points into a specific parlay leg, sharing proportionally in that leg's outcome. Applies identically to regular multiplayer parlays and Day's Parlay — there is no separate concept for the two. Backing a leg does **not** by itself grant rollover-voting rights in a regular parlay (see "Member vote" below) — it does in Day's Parlay, where every backer votes.
_Avoid_: Stakeholder

**Active user** (for MEAN eligibility):
A user who has ever created at least one `Position` or one `LegStake` — win or lose, open or settled, single-market or parlay. No recency window; once active, always counted. MEAN (§5) is computed only over active users, so dormant signups sitting at the starting balance don't dilute the benchmark.

**Append** (regular parlay) / **Claim** (Day's Parlay):
The act of adding a new leg to a parlay's chain. Always atomic with placing that leg's first stake — there is no such thing as a leg in a chain with zero backers. Appending/claiming without an accompanying purchase of shares in that outcome is not a valid state. See ADR-0001.
_Avoid_: treating "add a leg" and "stake on a leg" as independently orderable steps for the leg-adder specifically (they remain independent for every other backer who stakes afterward).

**Member vote** (regular multiplayer parlay only):
The sole rollover-authority mechanism for regular parlays. A persistent, toggleable vote restricted to a leg's **formal-member** backers, weighted by each member's current stake on that leg (not headcount). A rollover executes the instant the combined stake of members voting "yes" exceeds 50% of the leg's total *member* stake — non-member (open-staker) stake is excluded from that total entirely, and non-members have no vote at all, though their money still moves with the leg once it passes. If no combination of votes ever crosses 50%, the leg simply rides to actual resolution — a valid default, not a deadlock. See ADR-0003 (supersedes ADR-0002's "leg control"/unilateral-takeover design and the "default to opener" tiebreak, neither of which survived).
_Avoid_: "leg control," "hostile takeover," "owner override" — all describe the superseded ADR-0002 design, not the current mechanism.

**Parlay creator**:
The user who set up a regular parlay's initial (fixed) roster. Purely a record of who created it — confers no rollover authority over any leg beyond their own stake-weighted member vote, same as any other member. Day's Parlay has no creator/owner concept at all.
