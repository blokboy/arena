import { NextResponse } from "next/server";

import { currentUserFromHeaders } from "@/server/current-user";
import { listRandomParlays } from "@/server/parlays";

const DEFAULT_LIMIT = 3;

export async function GET(request: Request) {
  const user = await currentUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam === null ? DEFAULT_LIMIT : Number(limitParam);

  if (!Number.isInteger(limit) || limit <= 0) {
    return NextResponse.json({ error: { code: "INVALID_LIMIT" } }, { status: 400 });
  }

  return NextResponse.json({
    parlays: await listRandomParlays(limit)
  });
}
