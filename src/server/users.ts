import { STARTING_BALANCE } from "@/lib/money";
import { getUtcGrantDay } from "@/domain/settlement";
import { prisma, shouldUseRealDatabase } from "@/server/db";

export type StoredUser = {
  id: string;
  username: string;
  passwordHash: string;
  balance: number;
  hasSeenStartingBalanceBanner: boolean;
  stipendGrantedToday: boolean;
};

export type UserRepository = {
  createUser(input: { username: string; passwordHash: string }): Promise<StoredUser>;
  findByUsername(username: string): Promise<StoredUser | undefined>;
  findById(id: string): Promise<StoredUser | undefined>;
  markStartingBalanceBannerSeen(id: string): Promise<StoredUser | undefined>;
  updateBalance(id: string, balance: number): Promise<StoredUser | undefined>;
  searchByUsername(query: string): Promise<Array<{ id: string; username: string }>>;
  clear(): Promise<void>;
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
    async createUser(input) {
      const user = {
        id: `user_${state.nextId++}`,
        username: input.username,
        passwordHash: input.passwordHash,
        balance: STARTING_BALANCE,
        hasSeenStartingBalanceBanner: false,
        stipendGrantedToday: false
      };
      users.set(user.username, user);
      ids.set(user.id, user);
      return user;
    },
    async findByUsername(username) {
      return users.get(username);
    },
    async findById(id) {
      return ids.get(id);
    },
    async markStartingBalanceBannerSeen(id) {
      const user = ids.get(id);
      if (!user) {
        return undefined;
      }

      user.hasSeenStartingBalanceBanner = true;
      return user;
    },
    async updateBalance(id, balance) {
      const user = ids.get(id);
      if (!user) {
        return undefined;
      }

      user.balance = balance;
      return user;
    },
    async searchByUsername(query) {
      const lower = query.toLowerCase();
      const matches: Array<{ id: string; username: string }> = [];
      for (const user of users.values()) {
        if (user.username.toLowerCase().includes(lower)) {
          matches.push({ id: user.id, username: user.username });
        }
      }
      return matches;
    },
    async clear() {
      users.clear();
      ids.clear();
      state.nextId = 1;
    }
  };
}

// `signupBannerAt` (nullable timestamp) is the persisted column; the
// repository interface exposes it as a plain boolean since callers only ever
// care whether the banner has been seen, never when.
function toStoredUser(row: {
  id: string;
  username: string;
  passwordHash: string;
  balance: { toNumber(): number };
  signupBannerAt: Date | null;
  stipendGrantedToday?: boolean;
  stipendGrants?: Array<{ id: string }>;
}): StoredUser {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    balance: row.balance.toNumber(),
    hasSeenStartingBalanceBanner: row.signupBannerAt !== null,
    stipendGrantedToday: row.stipendGrantedToday ?? (row.stipendGrants?.length ?? 0) > 0
  };
}

export function createPrismaUserRepository(): UserRepository {
  return {
    async createUser(input) {
      const row = await prisma.user.create({
        data: { username: input.username, passwordHash: input.passwordHash }
      });
      return toStoredUser(row);
    },
    async findByUsername(username) {
      const row = await prisma.user.findUnique({
        where: { username },
        include: {
          stipendGrants: {
            where: { dayKey: getUtcGrantDay(new Date()) },
            select: { id: true }
          }
        }
      });
      return row ? toStoredUser(row) : undefined;
    },
    async findById(id) {
      const row = await prisma.user.findUnique({
        where: { id },
        include: {
          stipendGrants: {
            where: { dayKey: getUtcGrantDay(new Date()) },
            select: { id: true }
          }
        }
      });
      return row ? toStoredUser(row) : undefined;
    },
    async markStartingBalanceBannerSeen(id) {
      try {
        const row = await prisma.user.update({
          where: { id },
          data: { signupBannerAt: new Date() }
        });
        return toStoredUser(row);
      } catch {
        return undefined;
      }
    },
    async updateBalance(id, balance) {
      try {
        const row = await prisma.user.update({ where: { id }, data: { balance } });
        return toStoredUser(row);
      } catch {
        return undefined;
      }
    },
    async searchByUsername(query) {
      const rows = await prisma.user.findMany({
        where: { username: { contains: query, mode: "insensitive" } },
        select: { id: true, username: true },
        take: 20
      });
      return rows.map((row) => ({ id: row.id, username: row.username }));
    },
    async clear() {
      await prisma.bankruptcyStipendGrant.deleteMany();
      await prisma.user.deleteMany();
    }
  };
}

const globalMemory = globalThis as typeof globalThis & {
  __arenaUserRepositoryState?: MemoryUserRepositoryState;
  __arenaUserRepository?: UserRepository;
};

export const userRepository = (globalMemory.__arenaUserRepository ??= shouldUseRealDatabase()
  ? createPrismaUserRepository()
  : createMemoryUserRepository(
      (globalMemory.__arenaUserRepositoryState ??= createMemoryUserRepositoryState())
    ));
