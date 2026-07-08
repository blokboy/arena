import { NextResponse } from "next/server";

import { currentUserFromHeaders } from "@/server/current-user";
import { userRepository } from "@/server/users";

export async function GET(request: Request) {
  const user = await currentUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("query");

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ users: [] });
  }

  const matches = await userRepository.searchByUsername(query.trim());

  return NextResponse.json({ users: matches });
}
