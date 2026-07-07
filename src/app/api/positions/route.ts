import { NextResponse } from "next/server";

import { currentUserFromHeaders } from "@/server/current-user";
import { buyPositionLot } from "@/server/positions";

const BUY_ERROR_STATUSES: Record<string, number> = {
  INVALID_OUTCOME: 400,
  INVALID_STAKE: 400,
  MARKET_NOT_FOUND: 404,
  MARKET_CLOSED: 409,
  MARKET_INACTIVE: 409,
  PRICE_UNAVAILABLE: 409,
  INSUFFICIENT_BALANCE: 422
};

export async function POST(request: Request) {
  const user = currentUserFromHeaders(request.headers);
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

  const { marketId, outcomeIndex, stake } = body as {
    marketId?: unknown;
    outcomeIndex?: unknown;
    stake?: unknown;
  };
  if (typeof marketId !== "string" || marketId.trim() === "") {
    return NextResponse.json({ error: { code: "INVALID_MARKET_ID" } }, { status: 400 });
  }
  if (typeof outcomeIndex !== "number") {
    return NextResponse.json({ error: { code: "INVALID_OUTCOME" } }, { status: 400 });
  }
  if (typeof stake !== "string") {
    return NextResponse.json({ error: { code: "INVALID_STAKE" } }, { status: 400 });
  }

  try {
    const { lot, balance } = buyPositionLot({
      user,
      marketId,
      outcomeIndex,
      stake,
      now: new Date()
    });

    return NextResponse.json({ position: lot, balance }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message in BUY_ERROR_STATUSES) {
      return NextResponse.json(
        { error: { code: error.message } },
        { status: BUY_ERROR_STATUSES[error.message] }
      );
    }

    throw error;
  }
}
