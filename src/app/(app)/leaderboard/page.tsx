import { AppShell } from "@/components/app-shell";

export default function LeaderboardPage() {
  return (
    <AppShell currentPath="/leaderboard" user={{ username: "demo", balance: 1000 }}>
      <h1 className="text-2xl font-semibold">Leaderboard</h1>
      <p className="mt-2 text-slate-600">MEAN and all-time rankings will appear here.</p>
    </AppShell>
  );
}
