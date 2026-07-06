import { userRepository } from "@/server/users";
import { sessionCookieFromHeaders, userIdForSession } from "@/server/sessions";

export function currentUserFromHeaders(headers: Headers) {
  const userId =
    headers.get("x-test-user-id") ?? userIdForSession(sessionCookieFromHeaders(headers));
  if (!userId) {
    return undefined;
  }

  return userRepository.findById(userId);
}
