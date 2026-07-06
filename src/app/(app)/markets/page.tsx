import { AppShell } from "@/components/app-shell";
import { currentUserOrRedirect } from "@/server/authenticated-user";

export default async function MarketsPage() {
  const user = await currentUserOrRedirect();

  return (
    <AppShell currentPath="/markets" user={user}>
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Markets</h1>
          <p className="text-slate-600">Cached Polymarket categories will appear here.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {["Politics", "Sports", "Crypto"].map((category) => (
            <article key={category} className="rounded-md border border-slate-200 bg-white p-4">
              <h2 className="font-medium">{category}</h2>
              <p className="mt-2 text-sm text-slate-600">No cached events yet.</p>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
