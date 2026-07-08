import { buildLeaderboard } from "@/domain/leaderboard";
import { prisma } from "@/server/db";

export async function listLeaderboard() {
  const [users, positionUserIds, legStakeUserIds] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, username: true, balance: true },
      orderBy: { balance: "desc" }
    }),
    prisma.position.findMany({
      select: { userId: true },
      distinct: ["userId"]
    }),
    prisma.legStake.findMany({
      select: { userId: true },
      distinct: ["userId"]
    })
  ]);

  return buildLeaderboard({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      balance: u.balance.toNumber()
    })),
    positionUserIds: positionUserIds.map((p) => p.userId),
    legStakeUserIds: legStakeUserIds.map((ls) => ls.userId)
  });
}
