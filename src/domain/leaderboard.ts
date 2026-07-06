export type LeaderboardUser = {
  id: string;
  username: string;
  balance: number;
};

export type LeaderboardInput = {
  users: LeaderboardUser[];
  positionUserIds: string[];
  legStakeUserIds: string[];
};

export type LeaderboardRow = {
  rank: number;
  userId: string;
  username: string;
  balance: number;
};

export type Leaderboard = {
  rows: LeaderboardRow[];
  mean: number | null;
};

export function buildLeaderboard(input: LeaderboardInput): Leaderboard {
  const activeUserIds = new Set([...input.positionUserIds, ...input.legStakeUserIds]);

  const rows = [...input.users].sort(compareLeaderboardUsers).map((user, index) => ({
    rank: index + 1,
    userId: user.id,
    username: user.username,
    balance: user.balance
  }));

  const activeUsers = input.users.filter((user) => activeUserIds.has(user.id));

  return {
    rows,
    mean:
      activeUsers.length === 0
        ? null
        : activeUsers.reduce((total, user) => total + user.balance, 0) / activeUsers.length
  };
}

function compareLeaderboardUsers(left: LeaderboardUser, right: LeaderboardUser): number {
  const balanceOrder = right.balance - left.balance;
  return balanceOrder === 0 ? left.username.localeCompare(right.username) : balanceOrder;
}
