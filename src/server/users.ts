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
  updateBalance(id: string, balance: number): StoredUser | undefined;
  clear(): void;
};

type MemoryUserRepositoryState = {
  users: Map<string, StoredUser>;
  ids: Map<string, StoredUser>;
  nextId: number;
};

function createMemoryUserRepositoryState(): MemoryUserRepositoryState {
  return {
    users: new Map<string, StoredUser>(),
    ids: new Map<string, StoredUser>(),
    nextId: 1
  };
}

export function createMemoryUserRepository(
  state = createMemoryUserRepositoryState()
): UserRepository {
  const { users, ids } = state;

  return {
    createUser(input) {
      const user = {
        id: `user_${state.nextId++}`,
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
    updateBalance(id, balance) {
      const user = ids.get(id);
      if (!user) {
        return undefined;
      }

      user.balance = balance;
      return user;
    },
    clear() {
      users.clear();
      ids.clear();
      state.nextId = 1;
    }
  };
}

const globalMemory = globalThis as typeof globalThis & {
  __arenaUserRepositoryState?: MemoryUserRepositoryState;
};

export const userRepository = createMemoryUserRepository(
  (globalMemory.__arenaUserRepositoryState ??= createMemoryUserRepositoryState())
);
