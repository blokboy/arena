import { AppShell } from "@/components/app-shell";
import { DaysParlayClient } from "@/components/days-parlay/days-parlay-client";
import { currentUserOrRedirect } from "@/server/authenticated-user";

export default async function DaysParlayPage() {
  const user = await currentUserOrRedirect();

  return (
    <AppShell currentPath="/days-parlay" user={user}>
      <DaysParlayClient currentUserId={user.id} />
    </AppShell>
  );
}
