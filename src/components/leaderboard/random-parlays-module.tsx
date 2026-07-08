"use client";

import React from "react";
import Link from "next/link";

import type { RandomParlaySummary } from "@/server/parlays";

type RandomParlaysModuleProps = {
  parlays: RandomParlaySummary[];
};

export function RandomParlaysModule({ parlays }: RandomParlaysModuleProps) {
  return (
    <section aria-label="Random parlays" className="mt-10">
      <h2 className="mb-4 text-lg font-semibold text-slate-700">Random parlays</h2>
      {parlays.length === 0 ? (
        <p className="text-sm text-slate-400">No parlays to discover right now.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {parlays.map((parlay) => (
            <li key={parlay.id}>
              <Link
                href={`/parlays/${parlay.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
              >
                <h3 className="truncate text-sm font-medium text-slate-800">{parlay.name}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {parlay.rosterSize} member{parlay.rosterSize === 1 ? "" : "s"} &middot;{" "}
                  {parlay.chainLength} leg{parlay.chainLength === 1 ? "" : "s"}
                </p>
                {parlay.currentActiveLeg ? (
                  <>
                    <p className="mt-2 truncate text-xs text-slate-600">
                      {parlay.currentActiveLeg.marketQuestion}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {parlay.currentActiveLeg.status.toLowerCase()}
                    </p>
                  </>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
