import { userRepository } from "@/server/users";

export function currentUserFromHeaders(headers: Headers) {
  const userId = headers.get("x-test-user-id");
  if (!userId) {
    return undefined;
  }

  return userRepository.findById(userId);
}
