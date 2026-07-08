import { NextResponse } from "next/server";

import { SELL_ERROR_STATUSES } from "@/app/api/positions/sell-error-statuses";
import { currentUserFromHeaders } from "@/server/current-user";
import { sellPositionLot } from "@/server/positions";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await currentUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const { id } = await context.params;
  if (typeof id !== "string" || id.trim() === "") {
    return NextResponse.json({ error: { code: "INVALID_POSITION_ID" } }, { status: 400 });
  }

  try {
    const { lot, proceeds, balance } = await sellPositionLot({
      user,
      positionId: id,
      now: new Date()
    });

    return NextResponse.json({ position: lot, proceeds, balance });
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
