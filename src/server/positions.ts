import { calculateBuyQuote, subtractDecimalStrings, type PositionLot } from "@/domain/positions";
import { prisma, shouldUseRealDatabase } from "@/server/db";
import {
  marketCacheRepository,
  refreshMarketIfStale,
  type MarketCacheRepository
} from "@/server/markets";
import { userRepository, type StoredUser, type UserRepository } from "@/server/users";

export type StoredPositionLot = PositionLot & {
  userId: string;
};

export type PositionRepository = {
  createLot(input: {
    userId: string;
    marketId: string;
    marketQuestion: string;
    outcomeIndex: number;
    outcomeLabel: string;
    stake: string;
    shares: string;
    entryPrice: string;
    purchasedAt: string;
  }): Promise<StoredPositionLot>;
  listLotsByUserId(userId: string): Promise<StoredPositionLot[]>;
  findById(id: string): Promise<StoredPositionLot | undefined>;
  applySellResult(
    id: string,
    input: {
      shares: string;
      stake: string;
      status?: "OPEN" | "SOLD";
      exitPrice?: string;
      exitedAt?: string;
    }
  ): Promise<StoredPositionLot | undefined>;
  clear(): Promise<void>;
};

type MemoryPositionRepositoryState = {
  lots: StoredPositionLot[];
  nextId: number;
};

function createMemoryPositionRepositoryState(): MemoryPositionRepositoryState {
  return {
    lots: [],
    nextId: 1
  };
}

export function createMemoryPositionRepository(
  state = createMemoryPositionRepositoryState()
): PositionRepository {
  return {
    async createLot(input) {
      const lot: StoredPositionLot = {
        id: `lot_${state.nextId++}`,
        userId: input.userId,
        marketId: input.marketId,
        marketQuestion: input.marketQuestion,
        outcomeIndex: input.outcomeIndex,
        outcomeLabel: input.outcomeLabel,
        status: "OPEN",
        stake: input.stake,
        shares: input.shares,
        committedShares: "0",
        entryPrice: input.entryPrice,
        purchasedAt: input.purchasedAt
      };
      state.lots.push(lot);
      return { ...lot };
    },
    async listLotsByUserId(userId) {
      return state.lots.filter((lot) => lot.userId === userId).map((lot) => ({ ...lot }));
    },
    async findById(id) {
      const lot = state.lots.find((candidate) => candidate.id === id);
      return lot ? { ...lot } : undefined;
    },
    async applySellResult(id, input) {
      const lot = state.lots.find((candidate) => candidate.id === id);
      if (!lot) {
        return undefined;
      }

      lot.shares = input.shares;
      lot.stake = input.stake;
      if (input.status) {
        lot.status = input.status;
      }
      if (input.exitPrice !== undefined) {
        lot.exitPrice = input.exitPrice;
      }
      if (input.exitedAt !== undefined) {
        lot.exitedAt = input.exitedAt;
      }
      return { ...lot };
    },
    async clear() {
      state.lots = [];
      state.nextId = 1;
    }
  };
}

type PrismaPositionRow = {
  id: string;
  userId: string;
  marketId: string;
  outcomeIndex: number;
  entryPrice: { toString(): string };
  stake: { toString(): string };
  shares: { toString(): string };
  committedShares: { toString(): string };
  status: string;
  exitPrice: { toString(): string } | null;
  exitedAt: Date | null;
  createdAt: Date;
  market: { question: string; outcomes: unknown };
};

function toStoredLot(row: PrismaPositionRow): StoredPositionLot {
  const outcomes = row.market.outcomes as string[];
  return {
    id: row.id,
    userId: row.userId,
    marketId: row.marketId,
    marketQuestion: row.market.question,
    outcomeIndex: row.outcomeIndex,
    outcomeLabel: outcomes[row.outcomeIndex] ?? String(row.outcomeIndex),
    status: row.status as StoredPositionLot["status"],
    stake: row.stake.toString(),
    shares: row.shares.toString(),
    committedShares: row.committedShares.toString(),
    entryPrice: row.entryPrice.toString(),
    purchasedAt: row.createdAt.toISOString(),
    ...(row.exitedAt ? { exitedAt: row.exitedAt.toISOString() } : {}),
    ...(row.exitPrice ? { exitPrice: row.exitPrice.toString() } : {})
  };
}

const POSITION_INCLUDE = { market: { select: { question: true, outcomes: true } } } as const;

export function createPrismaPositionRepository(): PositionRepository {
  return {
    async createLot(input) {
      const marketRow = await prisma.cachedMarket.findUnique({
        where: { gammaId: input.marketId },
        select: { id: true }
      });
      if (!marketRow) {
        throw new Error("MARKET_NOT_FOUND");
      }

      const row = await prisma.position.create({
        data: {
          userId: input.userId,
          marketId: marketRow.id,
          outcomeIndex: input.outcomeIndex,
          entryPrice: input.entryPrice,
          stake: input.stake,
          shares: input.shares,
          // Explicit, not the createdAt @default(now()) — that's the
          // Postgres server's own clock, which vi.setSystemTime in tests
          // has no effect on, and callers may legitimately want control
          // over the recorded purchase time (e.g. backfills/retries).
          createdAt: new Date(input.purchasedAt)
        },
        include: POSITION_INCLUDE
      });
      return toStoredLot({ ...row, marketId: input.marketId });
    },
    async listLotsByUserId(userId) {
      const rows = await prisma.position.findMany({
        where: { userId },
        include: POSITION_INCLUDE,
        orderBy: { createdAt: "asc" }
      });
      return Promise.all(rows.map((row) => toStoredLotWithGammaMarketId(row)));
    },
    async findById(id) {
      const row = await prisma.position.findUnique({ where: { id }, include: POSITION_INCLUDE });
      return row ? toStoredLotWithGammaMarketId(row) : undefined;
    },
    async applySellResult(id, input) {
      try {
        const row = await prisma.position.update({
          where: { id },
          data: {
            shares: input.shares,
            stake: input.stake,
            ...(input.status ? { status: input.status } : {}),
            ...(input.exitPrice !== undefined ? { exitPrice: input.exitPrice } : {}),
            ...(input.exitedAt !== undefined ? { exitedAt: new Date(input.exitedAt) } : {})
          },
          include: POSITION_INCLUDE
        });
        return toStoredLotWithGammaMarketId(row);
      } catch {
        return undefined;
      }
    },
    async clear() {
      await prisma.position.deleteMany();
    }
  };
}

// Position.marketId is a CachedMarket foreign key (its Prisma row id), but
// StoredPositionLot.marketId is the domain-facing Gamma market id
// (CachedMarket.gammaId) everywhere else in the app — resolve the join once
// here so callers never see the internal FK.
async function toStoredLotWithGammaMarketId(
  row: PrismaPositionRow
): Promise<StoredPositionLot> {
  const market = await prisma.cachedMarket.findUnique({
    where: { id: row.marketId },
    select: { gammaId: true }
  });
  return toStoredLot({ ...row, marketId: market?.gammaId ?? row.marketId });
}

const globalMemory = globalThis as typeof globalThis & {
  __arenaPositionRepositoryState?: MemoryPositionRepositoryState;
  __arenaPositionRepository?: PositionRepository;
};

export const positionRepository = (globalMemory.__arenaPositionRepository ??=
  shouldUseRealDatabase()
    ? createPrismaPositionRepository()
    : createMemoryPositionRepository(
        (globalMemory.__arenaPositionRepositoryState ??= createMemoryPositionRepositoryState())
      ));

// Stakes are points amounts entered by users: unsigned decimals with at most
// two fraction digits. Anything finer cannot be represented losslessly in the
// number-backed StoredUser.balance field.
const STAKE_PATTERN = /^(?:\d+|\d*\.\d{1,2})$/;

export async function buyPositionLot(input: {
  user: StoredUser;
  marketId: string;
  outcomeIndex: number;
  stake: string;
  now: Date;
  marketCache?: MarketCacheRepository;
  users?: UserRepository;
  positions?: PositionRepository;
  gammaClient?: Parameters<typeof refreshMarketIfStale>[0]["gammaClient"];
}): Promise<{ lot: StoredPositionLot; balance: number }> {
  const marketCache = input.marketCache ?? marketCacheRepository;
  const users = input.users ?? userRepository;
  const positions = input.positions ?? positionRepository;

  let market = await marketCache.findMarketByGammaId(input.marketId);
  if (!market) {
    throw new Error("MARKET_NOT_FOUND");
  }
  market = await refreshMarketIfStale({
    market,
    now: input.now,
    repository: marketCache,
    gammaClient: input.gammaClient
  });

  if (market.closed) {
    throw new Error("MARKET_CLOSED");
  }
  if (!market.active) {
    throw new Error("MARKET_INACTIVE");
  }
  if (
    !Number.isInteger(input.outcomeIndex) ||
    input.outcomeIndex < 0 ||
    input.outcomeIndex >= market.outcomes.length
  ) {
    throw new Error("INVALID_OUTCOME");
  }
  if (!STAKE_PATTERN.test(input.stake.trim())) {
    throw new Error("INVALID_STAKE");
  }
  if (market.bestAsk === null) {
    throw new Error("PRICE_UNAVAILABLE");
  }

  let quote;
  try {
    quote = calculateBuyQuote({ stake: input.stake, bestAsk: market.bestAsk });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PRICE") {
      throw new Error("PRICE_UNAVAILABLE");
    }
    throw error;
  }

  return debitAndCreateLot({
    users,
    positions,
    userId: input.user.id,
    stake: quote.stake,
    lotInput: {
      userId: input.user.id,
      marketId: market.gammaId,
      marketQuestion: market.question,
      outcomeIndex: input.outcomeIndex,
      outcomeLabel: market.outcomes[input.outcomeIndex],
      stake: quote.stake,
      shares: quote.shares,
      entryPrice: quote.price,
      purchasedAt: input.now.toISOString()
    }
  });
}

// Debits the balance and creates the lot as one atomic unit — a rejected buy
// must never leave either side half-applied, and a concurrent buy from the
// same user must never be able to overspend past the real balance.
//
// The guard against overspending is a single atomic conditional UPDATE
// (`balance >= amount`, decrementing in the same statement), not a
// read-then-compute-then-write of an absolute balance value: under
// Postgres's default READ COMMITTED isolation, two concurrent transactions
// can both read the same starting balance, both pass a client-side
// sufficient-funds check, and then the second writer's blind absolute-value
// UPDATE would silently clobber the first writer's already-applied debit
// (a classic lost-update anomaly) — an in-SQL guarded decrement sidesteps
// this because Postgres evaluates the WHERE clause and the decrement against
// the row's live value inside the same statement, serialized by the row lock
// the UPDATE itself takes.
async function debitAndCreateLot(input: {
  users: UserRepository;
  positions: PositionRepository;
  userId: string;
  stake: string;
  lotInput: Parameters<PositionRepository["createLot"]>[0];
}): Promise<{ lot: StoredPositionLot; balance: number }> {
  if (!shouldUseRealDatabase()) {
    // Memory-backed repositories in tests run single-threaded with no real
    // concurrent access, so sequential calls through the same interface
    // used in production are already safe — no separate code path needed.
    const user = await input.users.findById(input.userId);
    if (!user) {
      throw new Error("MARKET_NOT_FOUND");
    }
    let debited: string;
    try {
      debited = subtractDecimalStrings(String(user.balance), input.stake);
    } catch (error) {
      if (error instanceof Error && error.message === "NEGATIVE_DECIMAL") {
        throw new Error("INSUFFICIENT_BALANCE");
      }
      throw error;
    }
    const balance = Number(debited);
    await input.users.updateBalance(input.userId, balance);
    const lot = await input.positions.createLot(input.lotInput);
    return { lot, balance };
  }

  return prisma.$transaction(async (tx) => {
    const debit = await tx.user.updateMany({
      where: { id: input.userId, balance: { gte: input.stake } },
      data: { balance: { decrement: input.stake } }
    });
    if (debit.count === 0) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    const updatedUser = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    const marketRow = await tx.cachedMarket.findUniqueOrThrow({
      where: { gammaId: input.lotInput.marketId },
      select: { id: true, question: true, outcomes: true }
    });
    const positionRow = await tx.position.create({
      data: {
        userId: input.userId,
        marketId: marketRow.id,
        outcomeIndex: input.lotInput.outcomeIndex,
        entryPrice: input.lotInput.entryPrice,
        stake: input.lotInput.stake,
        shares: input.lotInput.shares,
        createdAt: new Date(input.lotInput.purchasedAt)
      }
    });

    const lot = toStoredLot({
      ...positionRow,
      marketId: input.lotInput.marketId,
      market: { question: marketRow.question, outcomes: marketRow.outcomes }
    });

    return { lot, balance: updatedUser.balance.toNumber() };
  });
}
