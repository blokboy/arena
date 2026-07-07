/**
 * API error-envelope contract (PRD Part III §2):
 * failures are `{ error: { code, message, details? } }` with stable
 * machine-readable codes the frontend branches on.
 *
 * RUNNABLE NOW: pins the code vocabulary and its shape via the test-side
 * contract file (test/helpers/api-error-codes.ts). Once a shared app errors
 * module exists, re-export it from that contract file so these tests pin the
 * real implementation. Route-level behavior (status codes, details payloads,
 * auth) is skeletoned below for the api tier.
 */
import { describe, expect, it } from "vitest";

import { API_ERROR_CODES } from "../../test/helpers/api-error-codes";

describe("error code vocabulary", () => {
  it("contains every code the PRD names for frontend branching", () => {
    expect(API_ERROR_CODES).toEqual(
      expect.arrayContaining([
        "LEG_APPEND_TOO_EARLY",
        "MARKET_ALREADY_CLAIMED",
        "VOTE_ALREADY_SPENT",
        "ROLLOVER_CAP_REACHED",
        "INSUFFICIENT_BALANCE"
      ])
    );
  });

  it("codes are unique", () => {
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
  });

  it("codes are stable SCREAMING_SNAKE_CASE identifiers", () => {
    for (const code of API_ERROR_CODES) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });
});

describe("route auth & validation (need route handlers — api tier)", () => {
  it.todo("every /api route except register + auth returns 401 with no session");
  it.todo("invalid bodies return 400/422 with the envelope, never a bare string");
  it.todo(
    "POST /api/parlays/:id/legs → 422 LEG_APPEND_TOO_EARLY with details { activeLegEndDate, attemptedMarketEndDate }"
  );
  it.todo(
    "POST /api/days-parlay/legs → 409 MARKET_ALREADY_CLAIMED on a second claim of the same market"
  );
  it.todo(
    "POST /api/days-parlay/legs/:legId/rollover-vote → VOTE_ALREADY_SPENT with details { spentOnLegId, spentOnMarketQuestion }"
  );
  it.todo(
    "POST /api/days-parlay/legs/:legId/rollover-vote → ROLLOVER_CAP_REACHED once rolloverCount = 3"
  );
  it.todo("any stake/buy over balance → INSUFFICIENT_BALANCE");
  it.todo(
    "POST /api/parlays/:id/legs/:legId/rollover-vote from a non-member → 403 NOT_A_VOTING_MEMBER"
  );
  it.todo("does not expose HouseAccount.balance outside /api/days-parlay");
});
