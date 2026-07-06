import { AppShell } from "@/components/app-shell";
import { currentUserOrRedirect } from "@/server/authenticated-user";

export default async function PortfolioPage() {
  const user = await currentUserOrRedirect();

  return (
    <AppShell currentPath="/portfolio" user={user}>
      <h1 className="text-2xl font-semibold">Portfolio</h1>
      <p className="mt-2 text-slate-600">Open and settled positions will appear here.</p>
    </AppShell>
  );
}
