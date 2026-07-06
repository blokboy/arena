import { AppShell } from "@/components/app-shell";
import { currentUserOrRedirect } from "@/server/authenticated-user";

export default async function DaysParlayPage() {
  const user = await currentUserOrRedirect();

  return (
    <AppShell currentPath="/days-parlay" user={user}>
      <h1 className="text-2xl font-semibold">Day&apos;s Parlay</h1>
      <p className="mt-2 text-slate-600">Today&apos;s system-wide chain will appear here.</p>
    </AppShell>
  );
}
