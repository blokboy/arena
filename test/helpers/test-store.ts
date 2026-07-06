import { STARTING_BALANCE } from "@/lib/money";

export type TestUser = {
  id: string;
  username: string;
  passwordHash: string;
  balance: number;
};

const users = new Map<string, TestUser>();
let nextUserId = 1;

export function resetTestStore() {
  users.clear();
  nextUserId = 1;
}

export function createTestUser(input: {
  username: string;
  passwordHash: string;
  balance?: number;
}) {
  const user: TestUser = {
    id: `user_${nextUserId++}`,
    username: input.username,
    passwordHash: input.passwordHash,
    balance: input.balance ?? STARTING_BALANCE
  };
  users.set(user.username, user);
  return user;
}

export function findTestUser(username: string) {
  return users.get(username);
}

export function listTestUsers() {
  return Array.from(users.values());
}
