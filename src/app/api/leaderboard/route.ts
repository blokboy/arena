import { NextResponse } from "next/server";

import { listLeaderboard } from "@/server/leaderboard";
import { currentUserFromHeaders } from "@/server/current-user";

export async function GET(request: Request) {
  const user = await currentUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const leaderboard = await listLeaderboard();

  return NextResponse.json(leaderboard);
}
