import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { currentUserOrRedirect } from "@/server/authenticated-user";

export default async function ParlayDetailPlaceholderPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUserOrRedirect();
  const { id } = await params;

  return (
    <AppShell currentPath="/parlays" user={user}>
      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold">Parlay detail</h1>
          <p className="mt-1 text-slate-600">
            Detail views are still being wired up for this requirement set.
          </p>
        </div>
        <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-700">
          Current parlay id: <span className="font-mono">{id}</span>
        </div>
        <Link className="font-medium text-primary underline" href="/parlays">
          Back to parlays
        </Link>
      </section>
    </AppShell>
  );
}
