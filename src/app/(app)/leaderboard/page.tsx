import { AppShell } from "@/components/app-shell";
import { currentUserOrRedirect } from "@/server/authenticated-user";

export default async function LeaderboardPage() {
  const user = await currentUserOrRedirect();

  return (
    <AppShell currentPath="/leaderboard" user={user}>
      <h1 className="text-2xl font-semibold">Leaderboard</h1>
      <p className="mt-2 text-slate-600">MEAN and all-time rankings will appear here.</p>
    </AppShell>
  );
}
