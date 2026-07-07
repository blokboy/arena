import { NextResponse } from "next/server";

import { syncAllMarketCategories } from "@/server/markets";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED_CRON" } }, { status: 401 });
  }

  const result = await syncAllMarketCategories({ now: new Date() });

  return NextResponse.json({
    ok: true,
    syncedCategories: result.syncedCategories
  });
}

function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}
