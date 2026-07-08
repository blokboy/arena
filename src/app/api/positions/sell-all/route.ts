import { NextResponse } from "next/server";

import { SELL_ERROR_STATUSES } from "@/app/api/positions/sell-error-statuses";
import { currentUserFromHeaders } from "@/server/current-user";
import { sellAllPositions } from "@/server/positions";

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

  const { marketId, outcomeIndex } = body as { marketId?: unknown; outcomeIndex?: unknown };
  if (typeof marketId !== "string" || marketId.trim() === "") {
    return NextResponse.json({ error: { code: "INVALID_MARKET_ID" } }, { status: 400 });
  }
  if (typeof outcomeIndex !== "number") {
    return NextResponse.json({ error: { code: "INVALID_OUTCOME" } }, { status: 400 });
  }

  try {
    const { lots, proceeds, balance } = await sellAllPositions({
      user,
      marketId,
      outcomeIndex,
      now: new Date()
    });

    return NextResponse.json({ positions: lots, proceeds, balance });
  } catch (error) {
    if (error instanceof Error && error.message in SELL_ERROR_STATUSES) {
      return NextResponse.json(
        { error: { code: error.message } },
        { status: SELL_ERROR_STATUSES[error.message] }
      );
    }

    throw error;
  }
}
