import { AppShell } from "@/components/app-shell";
import { MarketsClient } from "@/components/markets/markets-client";
import { currentUserOrRedirect } from "@/server/authenticated-user";

export default async function MarketsPage() {
  const user = await currentUserOrRedirect();

  return (
    <AppShell currentPath="/markets" user={user}>
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Markets</h1>
          <p className="text-slate-600">Browse cached Polymarket events by category.</p>
        </div>
        <MarketsClient />
      </section>
    </AppShell>
  );
}
