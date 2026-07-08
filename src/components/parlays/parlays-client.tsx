"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

import type { UserParlaySummary } from "@/server/parlays";

type FetchStatus = "loading" | "success" | "error";

export function ParlaysClient() {
  const [status, setStatus] = useState<FetchStatus>("loading");
  const [parlays, setParlays] = useState<UserParlaySummary[]>([]);

  useEffect(() => {
    let active = true;

    fetch("/api/parlays")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("PARLAYS_REQUEST_FAILED");
        }

        const body = (await response.json()) as { parlays?: UserParlaySummary[] };
        return body.parlays ?? [];
      })
      .then((nextParlays) => {
        if (!active) {
          return;
        }

        setParlays(nextParlays);
        setStatus("success");
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setParlays([]);
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Parlays</h1>
          <p className="mt-1 text-slate-600">
            Create a locked-roster regular parlay and seed leg 1 with existing shares.
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-white"
          href="/parlays/new"
        >
          Create parlay
        </Link>
      </div>

      {status === "loading" ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Loading your active parlays…
        </div>
      ) : null}

      {status === "error" ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          Parlays could not be loaded right now.
        </p>
      ) : null}

      {status === "success" && parlays.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-600">
          <p>No active regular parlays yet.</p>
          <p className="mt-1">Create one to lock a roster and commit the first leg.</p>
        </div>
      ) : null}

      {status === "success" && parlays.length > 0 ? (
        <ul className="grid gap-4 lg:grid-cols-2" role="list">
          {parlays.map((parlay) => (
            <li className="rounded-md border border-slate-200 bg-white p-4 shadow-sm" key={parlay.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-medium text-slate-950">{parlay.name}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {parlay.rosterSize} member{parlay.rosterSize === 1 ? "" : "s"} ·{" "}
                    {parlay.chainLength} leg{parlay.chainLength === 1 ? "" : "s"}
                  </p>
                </div>
                <Link
                  className="text-sm font-medium text-primary underline"
                  href={`/parlays/${parlay.id}`}
                >
                  Open
                </Link>
              </div>

              {parlay.currentActiveLeg ? (
                <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-950">{parlay.currentActiveLeg.marketQuestion}</p>
                  <p className="mt-1">
                    {parlay.currentActiveLeg.status.toLowerCase()} · resolves{" "}
                    {formatDate(parlay.currentActiveLeg.endDate)}
                  </p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}
