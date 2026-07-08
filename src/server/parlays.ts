import { prisma } from "@/server/db";

export type RandomParlaySummary = {
  id: string;
  name: string;
  kind: "REGULAR";
  rosterSize: number;
  chainLength: number;
  currentActiveLeg: {
    legId: string;
    marketQuestion: string;
    endDate: string;
    status: string;
  } | null;
};

let configuredRandom = () => Math.random();

export async function listRandomParlays(limit: number): Promise<RandomParlaySummary[]> {
  const rows = await prisma.parlay.findMany({
    where: {
      kind: "REGULAR",
      status: "ACTIVE",
      legs: { some: {} }
    },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          members: true,
          legs: true
        }
      },
      legs: {
        select: {
          id: true,
          status: true,
          resolutionAt: true,
          market: {
            select: {
              question: true,
              endDate: true,
              gammaId: true
            }
          }
        },
        orderBy: [{ resolutionAt: "asc" }, { sortKey: "asc" }]
      }
    }
  });

  return shuffle(rows)
    .slice(0, limit)
    .map((row) => {
      const activeLeg = row.legs.find((leg) => leg.status === "ACTIVE") ?? row.legs[0] ?? null;

      return {
        id: row.id,
        name: row.name,
        kind: "REGULAR",
        rosterSize: row._count.members,
        chainLength: row._count.legs,
        currentActiveLeg: activeLeg
          ? {
              legId: activeLeg.id,
              marketQuestion: activeLeg.market.question,
              endDate: (activeLeg.market.endDate ?? activeLeg.resolutionAt).toISOString(),
              status: activeLeg.status
            }
          : null
      };
    });
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(configuredRandom() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex] as T, copy[index] as T];
  }

  return copy;
}

export function setParlayRandomForTesting(random: () => number): void {
  configuredRandom = random;
}

export function resetParlayRandomForTesting(): void {
  configuredRandom = () => Math.random();
}

export async function clearParlayData(): Promise<void> {
  await prisma.rolloverVote.deleteMany();
  await prisma.legStakeSource.deleteMany();
  await prisma.legStake.deleteMany();
  await prisma.parlayMember.deleteMany();
  await prisma.parlayLeg.deleteMany();
  await prisma.parlay.deleteMany();
}
