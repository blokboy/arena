import { NextResponse } from "next/server";

import { currentUserFromHeaders } from "@/server/current-user";
import { castRegularParlayRolloverVote } from "@/server/parlays";

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

  const { vote } = body as { vote?: unknown };
  if (typeof vote !== "boolean") {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }

  const errorStatusMap: Record<string, number> = {
    NOT_A_VOTING_MEMBER: 403,
    LEG_NOT_FOUND: 404,
    LEG_NOT_ACTIVE: 409,
    PARLAY_NOT_FOUND: 404,
    PARLAY_NOT_ACTIVE: 409,
    PRICE_UNAVAILABLE: 409
  };

  try {
    const result = await castRegularParlayRolloverVote({
      parlayId,
      legId,
      userId: user.id,
      vote,
      now: new Date()
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof Error && error.message in errorStatusMap) {
      const status = errorStatusMap[error.message]!;
      return NextResponse.json({ error: { code: error.message } }, { status });
    }
    throw error;
  }
}
