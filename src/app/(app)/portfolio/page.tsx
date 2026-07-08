import { AppShell } from "@/components/app-shell";
import { PortfolioClient } from "@/components/positions/portfolio-client";
import { currentUserOrRedirect } from "@/server/authenticated-user";

export default async function PortfolioPage() {
  const user = await currentUserOrRedirect();

  return (
    <AppShell currentPath="/portfolio" user={user}>
      <h1 className="text-2xl font-semibold">Portfolio</h1>
      <div className="mt-4">
        <PortfolioClient />
      </div>
    </AppShell>
  );
}
