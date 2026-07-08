import { AppShell } from "@/components/app-shell";
import { LeaderboardClient } from "@/components/leaderboard/leaderboard-client";
import { currentUserOrRedirect } from "@/server/authenticated-user";

export default async function LeaderboardPage() {
  const user = await currentUserOrRedirect();

  return (
    <AppShell currentPath="/leaderboard" user={user}>
      <h1 className="text-2xl font-semibold">Leaderboard</h1>
      <div className="mt-4">
        <LeaderboardClient />
      </div>
    </AppShell>
  );
}
