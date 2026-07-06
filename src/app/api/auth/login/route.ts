import { NextResponse } from "next/server";

import { authError, verifyCredentials } from "@/domain/auth";
import { createSession, SESSION_COOKIE_NAME } from "@/server/sessions";
import { userRepository } from "@/server/users";

export async function POST(request: Request) {
  const { body, isFormSubmission } = await authRequestBody(request);

  const result = await verifyCredentials(
    {
      username: body.username ?? "",
      password: body.password ?? ""
    },
    userRepository
  );

  if (!result.ok) {
    if (isFormSubmission) {
      return redirectTo(request, "/login?error=INVALID_CREDENTIALS");
    }

    return NextResponse.json({ error: authError("INVALID_CREDENTIALS") }, { status: 401 });
  }

  const response = isFormSubmission
    ? redirectTo(request, "/markets")
    : NextResponse.json({
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

async function authRequestBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const isFormSubmission =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");

  if (!isFormSubmission) {
    return {
      body: (await request.json()) as { username?: string; password?: string },
      isFormSubmission
    };
  }

  const formData = await request.formData();

  return {
    body: {
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? "")
    },
    isFormSubmission
  };
}

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), { status: 303 });
}
