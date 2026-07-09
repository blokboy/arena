import { NextResponse } from "next/server";

import { currentUserFromHeaders } from "@/server/current-user";
import { stakeParlayLeg } from "@/server/parlays";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; legId: string }> }
) {
  const user = await currentUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const { id: parlayId, legId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }

  const { commitments } = body as { commitments?: unknown };
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
    LEG_NOT_FOUND: 404,
    LEG_NOT_ACTIVE: 409,
    NO_COMMITMENTS: 400,
    COMMITMENT_POSITION_NOT_FOUND: 404,
    COMMITMENT_MARKET_MISMATCH: 422,
    COMMITMENT_EXCEEDS_AVAILABLE_SHARES: 422
  };

  try {
    const stake = await stakeParlayLeg({
      parlayId,
      legId,
      userId: user.id,
      commitments
    });

    return NextResponse.json({ data: { stake } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message in errorStatusMap) {
      const status = errorStatusMap[error.message]!;
      return NextResponse.json({ error: { code: error.message } }, { status });
    }
    throw error;
  }
}
