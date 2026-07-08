import { NextResponse } from "next/server";

import { currentUserFromHeaders } from "@/server/current-user";

export async function GET(request: Request) {
  const user = await currentUserFromHeaders(request.headers);

  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      balance: user.balance,
      showStartingBalance: !user.hasSeenStartingBalanceBanner
    }
  });
}
