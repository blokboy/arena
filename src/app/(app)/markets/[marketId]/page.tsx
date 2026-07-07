import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { currentUserOrRedirect } from "@/server/authenticated-user";
import { marketCacheRepository } from "@/server/markets";

export default async function MarketDetailPage({
  params
}: {
  params: Promise<{ marketId: string }>;
}) {
  const user = await currentUserOrRedirect();
  const { marketId } = await params;
  const market = marketCacheRepository.findMarketByGammaId(marketId);

  if (!market) {
    notFound();
  }

  return (
    <AppShell currentPath="/markets" user={user}>
      <section className="space-y-5">
        <div className="space-y-2">
          <Link href="/markets" className="text-sm font-medium text-slate-600 hover:text-slate-950">
            Back to markets
          </Link>
          <div>
            <p className="text-sm text-slate-600">
              {market.category} · {market.eventTitle}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">{market.question}</h1>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-950">Outcomes</h2>
            <div className="mt-3 divide-y divide-slate-100">
              {market.outcomes.map((outcome, index) => (
                <div
                  key={`${market.gammaId}-${outcome}`}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <span className="font-medium text-slate-900">{outcome}</span>
                  <span className="text-sm text-slate-600">
                    {formatPercent(market.outcomePrices[index])}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <aside className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-950">Market</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <DetailRow label="Status" value={market.closed ? "Closed" : "Open"} />
              <DetailRow label="Sell at" value={market.bestBid ?? "n/a"} />
              <DetailRow label="Buy at" value={market.bestAsk ?? "n/a"} />
              <DetailRow label="Last trade" value={market.lastTradePrice ?? "n/a"} />
              <DetailRow label="Volume" value={formatCompact(market.volume)} />
              <DetailRow label="Resolves" value={formatDate(market.endDate)} />
              <DetailRow label="Synced" value={formatDateTime(market.lastSyncedAt)} />
            </dl>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function formatPercent(value: string | undefined) {
  if (!value) {
    return "n/a";
  }
  const [integerPart, fractionPart = ""] = value.split(".");
  const scaled = `${integerPart}${fractionPart.padEnd(2, "0").slice(0, 2)}`;
  const percent = scaled.replace(/^0+(?=\d)/, "") || "0";
  return `${percent}%`;
}

function formatCompact(value: string) {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(Number(value));
}

function formatDate(value: string | null) {
  if (!value) {
    return "unknown";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
