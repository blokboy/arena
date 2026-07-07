import { NextResponse } from "next/server";

import { currentUserFromHeaders } from "@/server/current-user";
import { marketCacheRepository, refreshMarketIfStale } from "@/server/markets";

export async function GET(request: Request, context: { params: Promise<{ marketId: string }> }) {
  const user = await currentUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const { marketId } = await context.params;
  const cached = await marketCacheRepository.findMarketByGammaId(marketId);
  if (!cached) {
    return NextResponse.json({ error: { code: "MARKET_NOT_FOUND" } }, { status: 404 });
  }

  const market = await refreshMarketIfStale({ market: cached, now: new Date() });

  return NextResponse.json({ market });
}
