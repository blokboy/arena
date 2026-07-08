import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/server/sessions";

export async function POST(request: Request) {
  // Sessions are stateless JWTs — there is no server-side record to delete,
  // clearing the cookie is sufficient (a still-held copy of the token would
  // otherwise remain valid until it naturally expires).
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });

  return response;
}
