import { NextResponse } from "next/server";

import { currentUserFromHeaders } from "@/server/current-user";
import { createDraftParlay, listParlaysForUser } from "@/server/parlays";

export async function GET(request: Request) {
  const user = await currentUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const parlays = await listParlaysForUser(user.id);

  return NextResponse.json({ parlays });
}

export async function POST(request: Request) {
  const user = await currentUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }

  const { name, inviteUserIds } = body as {
    name?: unknown;
    inviteUserIds?: unknown;
  };

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: { code: "PARLAY_NAME_REQUIRED" } }, { status: 400 });
  }
  if (!Array.isArray(inviteUserIds)) {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }
  for (const id of inviteUserIds) {
    if (typeof id !== "string") {
      return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
    }
  }

  try {
    const parlay = await createDraftParlay({
      name: name.trim(),
      creatorId: user.id,
      inviteUserIds
    });

    return NextResponse.json({ parlay }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITEE_NOT_FOUND") {
      return NextResponse.json({ error: { code: "INVITEE_NOT_FOUND" } }, { status: 404 });
    }
    throw error;
  }
}
