import { AppShell } from "@/components/app-shell";

export default function PortfolioPage() {
  return (
    <AppShell currentPath="/portfolio" user={{ username: "demo", balance: 1000 }}>
      <h1 className="text-2xl font-semibold">Portfolio</h1>
      <p className="mt-2 text-slate-600">Open and settled positions will appear here.</p>
    </AppShell>
  );
}
