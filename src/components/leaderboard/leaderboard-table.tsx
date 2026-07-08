"use client";

import React from "react";

import { insertMeanRow, type LeaderboardRow } from "@/domain/leaderboard";
import { cn } from "@/lib/cn";
import { formatPoints } from "@/lib/money";

type LeaderboardTableProps = {
  rows: LeaderboardRow[];
  mean: number | null;
  currentUsername: string;
};

export function LeaderboardTable({ rows, mean, currentUsername }: LeaderboardTableProps) {
  const renderRows = React.useMemo(() => insertMeanRow(rows, mean), [rows, mean]);

  return (
    <div>
      <table className="w-full table-auto border-collapse">
        <caption className="sr-only">
          All-time leaderboard. MEAN is the live average balance across active users and is not a
          real account.
        </caption>
      <thead>
        <tr className="border-b border-slate-200 text-left text-sm font-medium text-slate-500">
          <th className="pb-2 pr-4">Rank</th>
          <th className="pb-2 pr-4">Player</th>
          <th className="pb-2 text-right">Balance</th>
        </tr>
      </thead>
      <tbody>
        {renderRows.map((entry, index) => {
          if (entry.kind === "mean") {
            return (
              <tr
                key="mean"
                aria-label="MEAN — not a real account"
                className="border-b border-slate-100 bg-slate-50 text-slate-500"
              >
                <td className="py-2 pr-4 text-sm tabular-nums text-slate-400">&mdash;</td>
                <td className="py-2 pr-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      MEAN
                    </span>
                    <span className="sr-only">Live average balance across all users</span>
                  </span>
                </td>
                <td className="py-2 text-right text-sm tabular-nums">
                  {formatPoints(entry.balance)}
                </td>
              </tr>
            );
          }

          const isCurrentUser = entry.username === currentUsername;

          return (
            <tr
              key={entry.userId}
              aria-label={entry.username}
              className={cn(
                "border-b border-slate-100",
                isCurrentUser && "border-l-2 border-l-sky-500 bg-sky-50"
              )}
            >
              <td className="py-2 pr-4 text-sm tabular-nums text-slate-500">{entry.rank}</td>
              <td className="py-2 pr-4">
                <span className="inline-flex items-center gap-1.5">
                  <span>{entry.username}</span>
                  {isCurrentUser ? (
                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-700">
                      You
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="py-2 text-right text-sm tabular-nums">
                {formatPoints(entry.balance)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
      <p className="mt-2 text-xs text-slate-400">
        Live average balance across all users &mdash; not a real account.
      </p>
    </div>
  );
}
