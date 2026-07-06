import { STARTING_BALANCE } from "@/lib/money";

export type StoredUser = {
  id: string;
  username: string;
  passwordHash: string;
  balance: number;
  hasSeenStartingBalanceBanner: boolean;
};

export type UserRepository = {
  createUser(input: { username: string; passwordHash: string }): StoredUser;
  findByUsername(username: string): StoredUser | undefined;
  findById(id: string): StoredUser | undefined;
  markStartingBalanceBannerSeen(id: string): StoredUser | undefined;
  clear(): void;
};

export function createMemoryUserRepository(): UserRepository {
  const users = new Map<string, StoredUser>();
  const ids = new Map<string, StoredUser>();
  let nextId = 1;

  return {
    createUser(input) {
      const user = {
        id: `user_${nextId++}`,
        username: input.username,
        passwordHash: input.passwordHash,
        balance: STARTING_BALANCE,
        hasSeenStartingBalanceBanner: false
      };
      users.set(user.username, user);
      ids.set(user.id, user);
      return user;
    },
    findByUsername(username) {
      return users.get(username);
    },
    findById(id) {
      return ids.get(id);
    },
    markStartingBalanceBannerSeen(id) {
      const user = ids.get(id);
      if (!user) {
        return undefined;
      }

      user.hasSeenStartingBalanceBanner = true;
      return user;
    },
    clear() {
      users.clear();
      ids.clear();
      nextId = 1;
    }
  };
}

export const userRepository = createMemoryUserRepository();
