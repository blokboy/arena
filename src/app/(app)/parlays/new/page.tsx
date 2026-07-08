import { AppShell } from "@/components/app-shell";
import { ParlayCreateFlow } from "@/components/parlays/parlay-create-flow";
import { currentUserOrRedirect } from "@/server/authenticated-user";

export default async function CreateParlayPage() {
  const user = await currentUserOrRedirect();

  return (
    <AppShell currentPath="/parlays" user={user}>
      <ParlayCreateFlow currentUser={{ id: user.id, username: user.username }} />
    </AppShell>
  );
}
