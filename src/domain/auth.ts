import bcrypt from "bcryptjs";

import { STARTING_BALANCE } from "@/lib/money";

export type SignupInput = {
  username: string;
  password: string;
  confirmPassword: string;
};

export type AuthErrorCode =
  | "USERNAME_REQUIRED"
  | "USERNAME_INVALID"
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_MISMATCH"
  | "USERNAME_TAKEN"
  | "INVALID_CREDENTIALS";

export type AuthResult =
  | { ok: true; username: string; balance: number }
  | { ok: false; code: AuthErrorCode; message: string };

export type CredentialUser = {
  id: string;
  username: string;
  passwordHash: string;
  balance: number;
  hasSeenStartingBalanceBanner?: boolean;
};

export type CredentialRepository = {
  findByUsername(username: string): CredentialUser | undefined;
};

export type CredentialResult =
  { ok: true; user: CredentialUser } | { ok: false; code: "INVALID_CREDENTIALS"; message: string };

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  USERNAME_REQUIRED: "Choose a username.",
  USERNAME_INVALID: "Use letters, numbers, underscores, or hyphens.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters.",
  PASSWORD_MISMATCH: "Passwords must match.",
  USERNAME_TAKEN: "That username is already taken.",
  INVALID_CREDENTIALS: "Invalid username or password."
};

export function validateSignup(input: SignupInput): AuthResult {
  const username = input.username.trim().toLowerCase();

  if (!username) {
    return authError("USERNAME_REQUIRED");
  }

  if (!/^[a-z0-9_-]{3,24}$/.test(username)) {
    return authError("USERNAME_INVALID");
  }

  if (input.password.length < 8) {
    return authError("PASSWORD_TOO_SHORT");
  }

  if (input.password !== input.confirmPassword) {
    return authError("PASSWORD_MISMATCH");
  }

  return { ok: true, username, balance: STARTING_BALANCE };
}

export function authError(code: AuthErrorCode): AuthResult {
  return { ok: false, code, message: AUTH_ERROR_MESSAGES[code] };
}

export function isAuthErrorCode(value: unknown): value is AuthErrorCode {
  return typeof value === "string" && value in AUTH_ERROR_MESSAGES;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function verifyCredentials(
  input: { username: string; password: string },
  users: CredentialRepository
): Promise<CredentialResult> {
  const username = input.username.trim().toLowerCase();
  const user = users.findByUsername(username);

  if (!user) {
    return credentialError();
  }

  const isValidPassword = await verifyPassword(input.password, user.passwordHash);

  if (!isValidPassword) {
    return credentialError();
  }

  return { ok: true, user };
}

function credentialError(): CredentialResult {
  return {
    ok: false,
    code: "INVALID_CREDENTIALS",
    message: AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS
  };
}
