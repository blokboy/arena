import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/server/cron-auth";
import { runSettlementSweep } from "@/server/settlement";

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED_CRON" } }, { status: 401 });
  }

  const result = await runSettlementSweep({ now: new Date() });

  return NextResponse.json({
    ok: true,
    marketIds: result.marketIds,
    skippedMarketIds: result.skippedMarketIds,
    settledPositions: result.settledPositions
  });
}
