import { NextResponse } from "next/server";

import { currentUserFromHeaders } from "@/server/current-user";
import { stakeDaysParlayLeg } from "@/server/days-parlay";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ legId: string }> }
) {
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

  const { commitments } = body as { commitments?: unknown };
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

  const { legId } = await params;

  const errorStatusMap: Record<string, number> = {
    COMMITMENT_EXCEEDS_AVAILABLE_SHARES: 422,
    COMMITMENT_MARKET_MISMATCH: 422,
    COMMITMENT_POSITION_NOT_FOUND: 404,
    LEG_NOT_FOUND: 404,
    LEG_NOT_STAKEABLE: 409,
    NO_COMMITMENTS: 400,
    POSITION_CONFLICT: 409
  };

  try {
    const stake = await stakeDaysParlayLeg({
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
