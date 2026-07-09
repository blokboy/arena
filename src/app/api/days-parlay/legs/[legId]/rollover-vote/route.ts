import { NextResponse } from "next/server";

import { currentUserFromHeaders } from "@/server/current-user";
import { castDaysParlayRolloverVote, DaysParlayRolloverError } from "@/server/days-parlay";

export async function POST(request: Request, { params }: { params: Promise<{ legId: string }> }) {
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

  // Day's Parlay only ever supports casting a "yes"/spend vote (Part I §8) —
  // there is no "no" vote concept here, unlike the regular-parlay route's
  // freely-reversible `{vote: boolean}` toggle. Reject anything other than
  // the literal `{vote: true}` contract rather than silently accepting
  // `false` as a no-op.
  const { vote } = body as { vote?: unknown };
  if (vote !== true) {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }

  const { legId } = await params;

  const errorStatusMap: Record<string, number> = {
    BACKER_REQUIRED: 403,
    FINAL_LEG_NOT_ROLLOVERABLE: 409,
    LEG_NOT_ACTIVE: 409,
    LEG_NOT_FOUND: 404,
    PARLAY_NOT_ACTIVE: 409,
    PRICE_UNAVAILABLE: 409,
    ROLLOVER_CAP_REACHED: 409,
    VOTE_ALREADY_SPENT: 409
  };

  try {
    const result = await castDaysParlayRolloverVote({
      legId,
      userId: user.id,
      now: new Date()
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof DaysParlayRolloverError) {
      return NextResponse.json(
        { error: { code: error.code, details: error.details } },
        { status: errorStatusMap[error.code] ?? 409 }
      );
    }

    if (error instanceof Error && error.message in errorStatusMap) {
      const status = errorStatusMap[error.message]!;
      return NextResponse.json({ error: { code: error.message } }, { status });
    }

    throw error;
  }
}
