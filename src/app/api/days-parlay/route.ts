import { NextResponse } from "next/server";

import { currentUserFromHeaders } from "@/server/current-user";
import { getDaysParlayDetail } from "@/server/days-parlay";

export async function GET(request: Request) {
  const user = await currentUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const data = await getDaysParlayDetail({ userId: user.id, now: new Date() });
  return NextResponse.json({ data });
}
