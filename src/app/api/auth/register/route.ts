import { NextResponse } from "next/server";

import { authError, hashPassword, validateSignup } from "@/domain/auth";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/sessions";
import { userRepository } from "@/server/users";

export async function POST(request: Request) {
  const { body, isFormSubmission } = await authRequestBody(request);

  const validation = validateSignup({
    username: body.username ?? "",
    password: body.password ?? "",
    confirmPassword: body.confirmPassword ?? ""
  });

  if (!validation.ok) {
    if (isFormSubmission) {
      return redirectTo(request, `/signup?error=${validation.code}`);
    }

    return NextResponse.json({ error: validation }, { status: 400 });
  }

  if (await userRepository.findByUsername(validation.username)) {
    if (isFormSubmission) {
      return redirectTo(request, "/signup?error=USERNAME_TAKEN");
    }

    return NextResponse.json({ error: authError("USERNAME_TAKEN") }, { status: 409 });
  }

  const passwordHash = await hashPassword(body.password ?? "");
  const user = await userRepository.createUser({ username: validation.username, passwordHash });

  const response = isFormSubmission
    ? redirectTo(request, "/markets")
    : NextResponse.json(
        {
          user: {
            id: user.id,
            username: user.username,
            balance: user.balance
          }
        },
        { status: 201 }
      );

  response.cookies.set(SESSION_COOKIE_NAME, await createSessionToken(user.id), {
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
      body: (await request.json()) as {
        username?: string;
        password?: string;
        confirmPassword?: string;
      },
      isFormSubmission
    };
  }

  const formData = await request.formData();

  return {
    body: {
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? "")
    },
    isFormSubmission
  };
}

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), { status: 303 });
}
