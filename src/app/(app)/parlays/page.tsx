import { AppShell } from "@/components/app-shell";
import { currentUserOrRedirect } from "@/server/authenticated-user";

export default async function ParlaysPage() {
  const user = await currentUserOrRedirect();

  return (
    <AppShell currentPath="/parlays" user={user}>
      <h1 className="text-2xl font-semibold">Parlays</h1>
      <p className="mt-2 text-slate-600">Regular multiplayer parlays will appear here.</p>
    </AppShell>
  );
}
