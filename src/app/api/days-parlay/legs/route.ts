import { NextResponse } from "next/server";

import { RegularParlayDomainError } from "@/domain/parlays";
import { currentUserFromHeaders } from "@/server/current-user";
import { claimDaysParlayMarket } from "@/server/days-parlay";

export async function POST(request: Request) {
  const user = await currentUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }

  const { marketId, outcomeIndex, commitments } = body as {
    marketId?: unknown;
    outcomeIndex?: unknown;
    commitments?: unknown;
  };

  if (typeof marketId !== "string" || marketId.trim() === "") {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }
  if (typeof outcomeIndex !== "number" || !Number.isInteger(outcomeIndex) || outcomeIndex < 0) {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }
  if (!Array.isArray(commitments)) {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }

  for (const commitment of commitments) {
    if (
      typeof commitment !== "object" ||
      commitment === null ||
      typeof (commitment as { positionId?: unknown }).positionId !== "string" ||
      typeof (commitment as { shares?: unknown }).shares !== "string"
    ) {
      return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
    }
  }

  const errorStatusMap: Record<string, number> = {
    ACTIVE_LEG_REQUIRED: 409,
    COMMITMENT_EXCEEDS_AVAILABLE_SHARES: 422,
    COMMITMENT_MARKET_MISMATCH: 422,
    COMMITMENT_POSITION_NOT_FOUND: 404,
    LEG_APPEND_TOO_EARLY: 422,
    MARKET_ALREADY_CLAIMED: 409,
    MARKET_CLOSED: 409,
    MARKET_INACTIVE: 409,
    MARKET_NOT_FOUND: 404,
    MARKET_OUTSIDE_DAY: 422,
    NO_COMMITMENTS: 400,
    PARLAY_NOT_ACTIVE: 409,
    POSITION_CONFLICT: 409
  };

  try {
    const result = await claimDaysParlayMarket({
      userId: user.id,
      marketId: marketId.trim(),
      outcomeIndex,
      commitments,
      now: new Date()
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message in errorStatusMap) {
      const status = errorStatusMap[error.message]!;
      const details = error instanceof RegularParlayDomainError ? error.details : undefined;
      return NextResponse.json(
        { error: { code: error.message, ...(details ? { details } : {}) } },
        { status }
      );
    }

    throw error;
  }
}
