import { createTestUser } from "@test/helpers/test-store";
import { hashPassword } from "@/domain/auth";

export async function authenticatedUser(username = "mira") {
  const password = "correct-horse";
  const passwordHash = await hashPassword(password);
  return {
    password,
    user: createTestUser({ username, passwordHash })
  };
}

export function unauthenticatedHeaders() {
  return new Headers();
}

export function authenticatedHeaders(userId: string) {
  return new Headers({ "x-test-user-id": userId });
}
