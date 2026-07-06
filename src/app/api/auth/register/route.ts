import { NextResponse } from "next/server";

import { authError, hashPassword, validateSignup } from "@/domain/auth";
import { createSession, SESSION_COOKIE_NAME } from "@/server/sessions";
import { userRepository } from "@/server/users";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    username?: string;
    password?: string;
    confirmPassword?: string;
  };

  const validation = validateSignup({
    username: body.username ?? "",
    password: body.password ?? "",
    confirmPassword: body.confirmPassword ?? ""
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation }, { status: 400 });
  }

  if (userRepository.findByUsername(validation.username)) {
    return NextResponse.json({ error: authError("USERNAME_TAKEN") }, { status: 409 });
  }

  const passwordHash = await hashPassword(body.password ?? "");
  const user = userRepository.createUser({ username: validation.username, passwordHash });

  const response = NextResponse.json(
    {
      user: {
        id: user.id,
        username: user.username,
        balance: user.balance
      }
    },
    { status: 201 }
  );

  response.cookies.set(SESSION_COOKIE_NAME, createSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });

  return response;
}
