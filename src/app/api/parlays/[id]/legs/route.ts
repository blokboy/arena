import { NextResponse } from "next/server";

import { currentUserFromHeaders } from "@/server/current-user";
import { addFirstParlayLeg } from "@/server/parlays";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }
  if (typeof outcomeIndex !== "number" || !Number.isInteger(outcomeIndex) || outcomeIndex < 0) {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }
  if (!Array.isArray(commitments)) {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }
  for (const commit of commitments) {
    if (
      typeof commit !== "object" ||
      commit === null ||
      typeof (commit as { positionId?: unknown }).positionId !== "string" ||
      typeof (commit as { shares?: unknown }).shares !== "string"
    ) {
      return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
    }
  }

  const errorStatusMap: Record<string, number> = {
    NO_COMMITMENTS: 400,
    COMMITMENT_POSITION_NOT_FOUND: 404,
    COMMITMENT_MARKET_MISMATCH: 422,
    COMMITMENT_EXCEEDS_AVAILABLE_SHARES: 422,
    NOT_A_MEMBER: 403,
    PARLAY_NOT_FOUND: 404,
    PARLAY_NOT_DRAFT: 409
  };

  try {
    const result = await addFirstParlayLeg({
      userId: user.id,
      parlayId,
      marketId: marketId.trim(),
      outcomeIndex,
      commitments,
      now: new Date()
    });

    return NextResponse.json(
      {
        leg: { id: result.legId, status: result.legStatus },
        parlay: { id: parlayId, status: result.parlayStatus }
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message in errorStatusMap) {
      const status = errorStatusMap[error.message]!;
      return NextResponse.json({ error: { code: error.message } }, { status });
    }
    throw error;
  }
}
