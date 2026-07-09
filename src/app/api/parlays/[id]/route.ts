import { NextResponse } from "next/server";

import { currentUserFromHeaders } from "@/server/current-user";
import { getRegularParlayDetail } from "@/server/parlays";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const { id: parlayId } = await params;

  try {
    const data = await getRegularParlayDetail(parlayId, user.id);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === "PARLAY_NOT_FOUND") {
      return NextResponse.json({ error: { code: "PARLAY_NOT_FOUND" } }, { status: 404 });
    }
    throw error;
  }
}
