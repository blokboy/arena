import { randomUUID } from "node:crypto";

export const SESSION_COOKIE_NAME = "arena_session";

const sessions = new Map<string, string>();

export function createSession(userId: string) {
  const token = randomUUID();
  sessions.set(token, userId);
  return token;
}

export function deleteSession(token: string | undefined) {
  if (!token) {
    return;
  }
  sessions.delete(token);
}

export function userIdForSession(token: string | undefined) {
  if (!token) {
    return undefined;
  }
  return sessions.get(token);
}

export function clearSessions() {
  sessions.clear();
}

export function sessionCookieFromHeaders(headers: Headers) {
  const cookie = headers.get("cookie");
  if (!cookie) {
    return undefined;
  }

  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);
}
