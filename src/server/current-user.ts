import { userIdForHeaders } from "@/server/sessions";
import { userRepository } from "@/server/users";

export async function currentUserFromHeaders(headers: Headers) {
  const userId = headers.get("x-test-user-id") ?? (await userIdForHeaders(headers));
  if (!userId) {
    return undefined;
  }

  return userRepository.findById(userId);
}
