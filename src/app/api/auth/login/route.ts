import { NextResponse } from "next/server";

import { authError, verifyCredentials } from "@/domain/auth";
import { createSession, SESSION_COOKIE_NAME } from "@/server/sessions";
import { userRepository } from "@/server/users";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    username?: string;
    password?: string;
  };

  const result = await verifyCredentials(
    {
      username: body.username ?? "",
      password: body.password ?? ""
    },
    userRepository
  );

  if (!result.ok) {
    return NextResponse.json({ error: authError("INVALID_CREDENTIALS") }, { status: 401 });
  }

  const response = NextResponse.json({
    user: {
      id: result.user.id,
      username: result.user.username,
      balance: result.user.balance
    }
  });

  response.cookies.set(SESSION_COOKIE_NAME, createSession(result.user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });

  return response;
}
