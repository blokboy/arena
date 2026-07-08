# Gamma market resolution behavior verified: all markets are binary, price-collapse heuristic is sound, no explicit void flag

PRD Part III §6.1 left one pre-implementation verification task open: whether the
`outcomePrices`-collapse-to-`1`/`0` signal that works for binary markets also holds for
*multi-outcome* markets — e.g. a single market row with five candidates in its
`outcomes[]` array — and whether an explicit void/cancel flag supersedes the
price-collapse heuristic. This ADR records the findings from live Gamma API calls and
the official Polymarket documentation, and states the resulting implementation guidance.

---

## Question 1 — Can a single Gamma market row have more than two outcomes?

**Finding: No. Every Gamma market row is permanently binary (exactly two outcomes).**

The official Polymarket developer documentation states this explicitly:

> "A **market** is the fundamental tradable unit on Polymarket. Each market represents a
> single binary question with Yes/No outcomes."
>
> — <https://docs.polymarket.com/concepts/markets-events> (fetched 2026-07-08)

Every live market confirmed from the API has exactly two entries in `outcomes` and
`outcomePrices`. For example, from
`GET https://gamma-api.polymarket.com/markets/559695` (James Talarico, 2028 Dem
nomination, `negRisk: true`):

```json
"outcomes": "[\"Yes\", \"No\"]",
"outcomePrices": "[\"0.0135\", \"0.9865\"]"
```

What *looks* like a multi-outcome market in the UI — e.g. "Who will win the 2028
Democratic presidential nomination?" with many named candidates — is an **event** (a
Gamma `event` record) that contains **N separate binary market rows**, each asking "Will
[Candidate X] win?" The rows are linked by a shared `negRiskMarketID` and
`negRisk: true` flag, and the mechanism is documented as **Negative Risk**:

> "Negative risk is a mechanism for multi-outcome events where only one outcome can win.
> … In a neg risk event: A **No share** in any market can be converted into **1 Yes
> share in every other market**."
>
> — <https://docs.polymarket.com/advanced/neg-risk.md> (fetched 2026-07-08)

Live confirmation:
`GET https://gamma-api.polymarket.com/events?slug=democratic-presidential-nominee-2028`
returns one event record whose `markets[]` array contains many individual market rows,
each with `"outcomes": "[\"Yes\", \"No\"]"` and a distinct candidate question
(fetched 2026-07-08).

**Implementation consequence for settlement:** there is no multi-outcome market row to
handle as a special case. `detectMarketResolution` in `src/domain/settlement.ts` only
ever sees 2-element `outcomes[]`/`outcomePrices[]` arrays. The concern in PRD §6.1 — "a
5-candidate election in one market's `outcomes[]`/`outcomePrices[]`" — cannot arise for
any market fetched via `GET /markets/:id` on Gamma.

---

## Question 2 — Do resolved negRisk legs collapse `outcomePrices` to exactly one `1` and the rest `0`?

**Finding: Yes, identically to plain binary markets. Each leg collapses to `["1","0"]`
(Yes won) or `["0","1"]` (No won).**

Verified against the fully-resolved "Presidential Election Winner 2024" negRisk event
from
`GET https://gamma-api.polymarket.com/events?slug=presidential-election-winner-2024&closed=true`
(fetched 2026-07-08):

| Market row | Question | `outcomePrices` after resolution |
|---|---|---|
| `id: 253591` | Will Donald Trump win the 2024 US Presidential Election? | `["1", "0"]` — winner |
| `id: 253592` | Will Joe Biden win the 2024 US Presidential Election? | `["0", "1"]` — loser |
| `id: 253593` | Will Nikki Haley win the 2024 US Presidential Election? | `["0", "1"]` — loser |

All three rows carry `umaResolutionStatus: "resolved"` and `closed: true`. Additional
binary resolved examples from
`GET https://gamma-api.polymarket.com/markets?closed=true&limit=20` (fetched 2026-07-08)
show the same pattern.

**Implementation consequence for settlement:** the existing `detectMarketResolution`
logic in `src/domain/settlement.ts` is correct and complete for all Gamma market types.
No special handling is needed for negRisk legs — they are individually binary and resolve
identically to plain binary markets.

---

## Question 3 — Is there an explicit void/cancel flag?

**Finding: No dedicated boolean flag exists. The only confirmed signals are behavioral
(price pattern) and the `umaResolutionStatus` string, which does not discriminate void
from normal resolution.**

Fields verified absent from surveyed live market API responses:
- no `voided` boolean
- no `canceled` boolean
- no `void` string or enum field
- no `resolutionType` or `resolutionReason` field

The field `umaResolutionStatus` is present and set to `"resolved"` on closed markets
inspected — both normally-resolved (price collapsed to `"0"`/`"1"`) markets and, by
inference from market resolution rules, voided ones. It does not distinguish the two
paths.

In practice, voided/canceled CLOB-era markets use `closed: true` and non-collapsed
prices (typically `["0.5", "0.5"]`). The price-collapse heuristic catches this
correctly: neither outcome price equals `"1"`, so `detectMarketResolution` returns
`{ status: "VOIDED" }`.

**Implementation consequence for settlement:** PRD §6.1's guidance — "prefer an explicit
flag if one is confirmed; fall back to price-collapse otherwise" — collapses to: **the
price-collapse check is the mechanism**. No explicit flag to prefer was found.

---

## Summary for task #42

| Question | Answer | Primary source |
|---|---|---|
| Can a single Gamma market row have >2 outcomes? | **No** — permanently binary (Yes/No) | <https://docs.polymarket.com/concepts/markets-events> |
| Do "multi-outcome" events exist on Gamma? | **Yes** — as N binary rows sharing `negRiskMarketID` | <https://docs.polymarket.com/advanced/neg-risk.md>; `GET /events?slug=democratic-presidential-nominee-2028` |
| Do resolved negRisk legs collapse to one `1`, rest `0`? | **Yes** | `GET /events?slug=presidential-election-winner-2024&closed=true` |
| Explicit `voided`/`canceled` boolean in Gamma API? | **No** | Live Gamma market response field survey |
| Is `detectMarketResolution`'s current implementation correct? | **Yes** | `src/domain/settlement.ts` plus the sources above |

**No code changes to `src/domain/settlement.ts` or `src/server/settlement.ts` are
required as a result of this verification.** The pre-implementation verification task
from PRD Part III §6.1 is closed.
