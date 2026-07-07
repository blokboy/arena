import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { calculateBuyQuote, subtractDecimalStrings, type PositionLot } from "@/domain/positions";
import { marketCacheRepository, type MarketCacheRepository } from "@/server/markets";
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
  }): StoredPositionLot;
  listLotsByUserId(userId: string): StoredPositionLot[];
  clear(): void;
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
    createLot(input) {
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
    listLotsByUserId(userId) {
      return state.lots.filter((lot) => lot.userId === userId).map((lot) => ({ ...lot }));
    },
    clear() {
      state.lots = [];
      state.nextId = 1;
    }
  };
}

type SerializedPositionState = {
  lots: StoredPositionLot[];
  nextId: number;
};

export function createFilePositionRepository(filePath: string): PositionRepository {
  const state = readPositionFile(filePath);
  const repository = createMemoryPositionRepository(state);

  return {
    createLot(input) {
      const lot = repository.createLot(input);
      writePositionFile(filePath, state);
      return lot;
    },
    listLotsByUserId(userId) {
      return repository.listLotsByUserId(userId);
    },
    clear() {
      repository.clear();
      if (existsSync(filePath)) {
        rmSync(filePath);
      }
    }
  };
}

function readPositionFile(filePath: string): MemoryPositionRepositoryState {
  if (!existsSync(filePath)) {
    return createMemoryPositionRepositoryState();
  }

  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as SerializedPositionState;
  return {
    lots: parsed.lots ?? [],
    nextId: parsed.nextId ?? 1
  };
}

function writePositionFile(filePath: string, state: MemoryPositionRepositoryState) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify({ lots: state.lots, nextId: state.nextId }, null, 2));
}

const globalMemory = globalThis as typeof globalThis & {
  __arenaPositionRepositoryState?: MemoryPositionRepositoryState;
  __arenaPositionRepository?: PositionRepository;
};

export const positionRepository = (globalMemory.__arenaPositionRepository ??=
  process.env.NODE_ENV === "test"
    ? createMemoryPositionRepository(
        (globalMemory.__arenaPositionRepositoryState ??= createMemoryPositionRepositoryState())
      )
    : createFilePositionRepository(join(process.cwd(), ".arena-cache", "positions.json")));

// Stakes are points amounts entered by users: unsigned decimals with at most
// two fraction digits. Anything finer cannot be represented losslessly in the
// number-backed StoredUser.balance field.
const STAKE_PATTERN = /^(?:\d+|\d*\.\d{1,2})$/;

export function buyPositionLot(input: {
  user: StoredUser;
  marketId: string;
  outcomeIndex: number;
  stake: string;
  now: Date;
  marketCache?: MarketCacheRepository;
  users?: UserRepository;
  positions?: PositionRepository;
}): { lot: StoredPositionLot; balance: number } {
  const marketCache = input.marketCache ?? marketCacheRepository;
  const users = input.users ?? userRepository;
  const positions = input.positions ?? positionRepository;

  const market = marketCache.findMarketByGammaId(input.marketId);
  if (!market) {
    throw new Error("MARKET_NOT_FOUND");
  }
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

  let debitedBalance: string;
  try {
    debitedBalance = subtractDecimalStrings(String(input.user.balance), quote.stake);
  } catch (error) {
    if (error instanceof Error && error.message === "NEGATIVE_DECIMAL") {
      throw new Error("INSUFFICIENT_BALANCE");
    }
    throw error;
  }

  // All validation is complete: apply the debit and create the lot together so
  // a rejected buy never leaves either side half-applied.
  const balance = Number(debitedBalance);
  users.updateBalance(input.user.id, balance);
  const lot = positions.createLot({
    userId: input.user.id,
    marketId: market.gammaId,
    marketQuestion: market.question,
    outcomeIndex: input.outcomeIndex,
    outcomeLabel: market.outcomes[input.outcomeIndex],
    stake: quote.stake,
    shares: quote.shares,
    entryPrice: quote.price,
    purchasedAt: input.now.toISOString()
  });

  return { lot, balance };
}
