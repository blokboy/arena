import { NextResponse } from "next/server";

import { currentUserFromHeaders } from "@/server/current-user";
import { marketCacheRepository } from "@/server/markets";

export async function GET(request: Request, context: { params: Promise<{ marketId: string }> }) {
  const user = currentUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const { marketId } = await context.params;
  const market = marketCacheRepository.findMarketByGammaId(marketId);
  if (!market) {
    return NextResponse.json({ error: { code: "MARKET_NOT_FOUND" } }, { status: 404 });
  }

  return NextResponse.json({ market });
}
