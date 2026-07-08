import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/server/cron-auth";
import { grantDailyBankruptcyStipends } from "@/server/settlement";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED_CRON" } }, { status: 401 });
  }

  const result = await grantDailyBankruptcyStipends({ now: new Date() });

  return NextResponse.json({
    ok: true,
    dayKey: result.dayKey,
    grantedUserIds: result.grantedUserIds
  });
}
