import { AppShell } from "@/components/app-shell";
import { ParlaysClient } from "@/components/parlays/parlays-client";
import { currentUserOrRedirect } from "@/server/authenticated-user";

export default async function ParlaysPage() {
  const user = await currentUserOrRedirect();

  return (
    <AppShell currentPath="/parlays" user={user}>
      <ParlaysClient />
    </AppShell>
  );
}
