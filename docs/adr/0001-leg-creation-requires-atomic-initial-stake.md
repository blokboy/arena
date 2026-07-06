# Leg creation and its first stake are one atomic action

Backend's original API sketch modeled adding a leg to a parlay chain (`POST /api/parlays/:id/legs` for append, `POST /api/days-parlay/legs` for claim) as a separate call from staking (`.../stake`), implying a leg could exist claimed/appended but unstaked. Grilling the PRD surfaced that this is not a valid product state: appending or claiming a leg *is* the act of buying shares in that outcome — there is no such thing as adding a leg to the chain without the adder personally staking into it as part of the same action.

**Decision:** the leg-add endpoints must accept a stake amount in the same request and create the `ParlayLeg` and the adder's first `LegStake` in a single transaction. A leg-add request with no accompanying stake is rejected as invalid, not persisted as a stakeless "shell" leg. Every other backer staking afterward remains a fully separate action, unaffected by this.

**Why it matters beyond convenience:** without this constraint, a claimed-but-never-staked leg could reach its resolution time with nothing to settle, forcing a second edge-case rule (skip it, void it, fail the chain?) that this decision eliminates by construction — that state simply cannot occur.
