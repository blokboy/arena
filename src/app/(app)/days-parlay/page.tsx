import { AppShell } from "@/components/app-shell";

export default function DaysParlayPage() {
  return (
    <AppShell currentPath="/days-parlay" user={{ username: "demo", balance: 1000 }}>
      <h1 className="text-2xl font-semibold">Day&apos;s Parlay</h1>
      <p className="mt-2 text-slate-600">Today&apos;s system-wide chain will appear here.</p>
    </AppShell>
  );
}
