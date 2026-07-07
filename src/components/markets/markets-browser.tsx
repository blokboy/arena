"use client";

import React from "react";
import { useState } from "react";
import Link from "next/link";

import {
  CATEGORY_TAGS,
  MARKET_CATEGORIES,
  type CachedEvent,
  type CachedMarket,
  type MarketCategory
} from "@/domain/markets";
import { cn } from "@/lib/cn";

export type MarketsBrowserProps = {
  events: CachedEvent[];
  selectedCategory: MarketCategory;
  status: "loading" | "success" | "error";
  onCategoryChange: (category: MarketCategory) => void;
};

export function MarketsBrowser({
  events,
  selectedCategory,
  status,
  onCategoryChange
}: MarketsBrowserProps) {
  return (
    <section className="space-y-5">
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2" aria-label="Market categories">
          {MARKET_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={category === selectedCategory}
              onClick={() => onCategoryChange(category)}
              className={cn(
                "min-h-11 rounded-md border px-3 py-2 text-sm font-medium transition",
                category === selectedCategory
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
              )}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {status === "loading" ? <EventSkeletons /> : null}

      {status === "success" && events.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          No cached {selectedCategory} events yet.
        </p>
      ) : null}

      {status === "success" && events.length > 0 ? (
        <div className="space-y-3">
          {events.map((event) => (
            <EventCard key={event.gammaId} event={event} />
          ))}
        </div>
      ) : null}

      {status === "error" ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-5 text-sm text-red-700"
        >
          Markets could not be loaded.
        </p>
      ) : null}
    </section>
  );
}

function EventCard({ event }: { event: CachedEvent }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = `event-${event.gammaId}-markets`;

  return (
    <article className="rounded-md border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-medium text-slate-950">{event.title}</h2>
          <p className="mt-1 text-sm text-slate-600">
            Volume {formatCompact(event.volume)} · Synced {formatDateTime(event.lastSyncedAt)}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((value) => !value)}
          className="min-h-11 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
        >
          {expanded ? "Hide" : "Show"} markets for {event.title}
        </button>
      </div>

      {expanded ? (
        <div id={contentId} className="border-t border-slate-200">
          {event.markets.map((market) => (
            <MarketRow key={market.gammaId} market={market} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function MarketRow({ market }: { market: CachedMarket }) {
  return (
    <div className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 lg:grid-cols-[1fr_auto_auto] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-slate-950">{market.question}</h3>
          {market.closed ? (
            <span className="rounded-sm bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
              Closed
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-600">
          {market.outcomes.map((outcome, index) => (
            <span key={`${market.gammaId}-${outcome}`}>
              {outcome} {formatPercent(market.outcomePrices[index])}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Resolves {formatDate(market.endDate)} · Volume {formatCompact(market.volume)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <span
          aria-label={`Sell ${market.question} at ${market.bestBid ?? "not available"}`}
          className="rounded-md bg-slate-100 px-3 py-2 text-slate-700"
        >
          Sell at {market.bestBid ?? "n/a"}
        </span>
        <span
          aria-label={`Buy ${market.question} at ${market.bestAsk ?? "not available"}`}
          className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800"
        >
          Buy at {market.bestAsk ?? "n/a"}
        </span>
      </div>

      {market.closed ? (
        <span
          aria-disabled="true"
          className="min-h-11 rounded-md border border-slate-200 px-4 py-2 text-center text-sm font-medium text-slate-400"
        >
          View market
        </span>
      ) : (
        <Link
          href={`/markets/${market.gammaId}`}
          className="min-h-11 rounded-md bg-slate-950 px-4 py-2 text-center text-sm font-medium text-white"
        >
          View market
        </Link>
      )}
    </div>
  );
}

function EventSkeletons() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-28 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500"
        >
          Loading market events
        </div>
      ))}
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
