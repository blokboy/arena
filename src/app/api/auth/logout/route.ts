import { NextResponse } from "next/server";

import { deleteSession, SESSION_COOKIE_NAME, sessionCookieFromHeaders } from "@/server/sessions";

export async function POST(request: Request) {
  deleteSession(sessionCookieFromHeaders(request.headers));

  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });

  return response;
}
