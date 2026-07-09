import { AppShell } from "@/components/app-shell";
import { ParlayDetailClient } from "@/components/parlays/parlay-detail-client";
import { currentUserOrRedirect } from "@/server/authenticated-user";

export default async function ParlayDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUserOrRedirect();
  const { id } = await params;

  return (
    <AppShell currentPath="/parlays" user={user}>
      <ParlayDetailClient parlayId={id} currentUserId={user.id} />
    </AppShell>
  );
}
