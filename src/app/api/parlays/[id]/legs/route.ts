import { NextResponse } from "next/server";

import { currentUserFromHeaders } from "@/server/current-user";
import { createFirstLeg } from "@/server/parlays";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await currentUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const { id: parlayId } = await params;

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
    return NextResponse.json({ error: { code: "INVALID_MARKET_ID" } }, { status: 400 });
  }
  if (typeof outcomeIndex !== "number" || !Number.isInteger(outcomeIndex) || outcomeIndex < 0) {
    return NextResponse.json({ error: { code: "INVALID_OUTCOME" } }, { status: 400 });
  }
  if (!Array.isArray(commitments) || commitments.length === 0) {
    return NextResponse.json({ error: { code: "NO_COMMITMENTS" } }, { status: 422 });
  }
  for (const commit of commitments) {
    if (
      typeof commit !== "object" ||
      commit === null ||
      typeof (commit as { positionId?: unknown }).positionId !== "string" ||
      typeof (commit as { shares?: unknown }).shares !== "string"
    ) {
      return NextResponse.json(
        { error: { code: "INVALID_COMMITMENT" } },
        { status: 400 }
      );
    }
  }

  try {
    const result = await createFirstLeg({
      user,
      parlayId,
      marketId: marketId.trim(),
      outcomeIndex,
      commitments
    });

    return NextResponse.json({ leg: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      const known = new Set([
        "INSUFFICIENT_BALANCE",
        "MARKET_NOT_FOUND",
        "MARKET_CLOSED",
        "MARKET_INACTIVE",
        "INVALID_OUTCOME",
        "PRICE_UNAVAILABLE",
        "POSITION_GROUP_NOT_FOUND",
        "POSITION_NOT_FOUND",
        "POSITION_NOT_OWNED",
        "POSITION_NOT_OPEN",
        "POSITION_WRONG_MARKET",
        "POSITION_WRONG_OUTCOME",
        "INSUFFICIENT_AVAILABLE_SHARES",
        "NO_COMMITMENTS",
        "PARLAY_NOT_FOUND",
        "PARLAY_NOT_DRAFT",
        "POSITION_CONFLICT"
      ]);
      const code = error.message;
      if (known.has(code)) {
        const status =
          code === "NO_COMMITMENTS" ||
          code === "INSUFFICIENT_AVAILABLE_SHARES" ||
          code === "POSITION_WRONG_MARKET" ||
          code === "POSITION_WRONG_OUTCOME" ||
          code === "POSITION_NOT_OWNED" ||
          code === "POSITION_NOT_OPEN" ||
          code === "POSITION_NOT_FOUND"
            ? 422
            : 400;
        return NextResponse.json({ error: { code } }, { status });
      }
    }
    throw error;
  }
}
