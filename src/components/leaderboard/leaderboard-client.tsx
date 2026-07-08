"use client";

import React, { useEffect, useState } from "react";

import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { RandomParlaysModule } from "@/components/leaderboard/random-parlays-module";
import type { LeaderboardRow } from "@/domain/leaderboard";
import type { RandomParlaySummary } from "@/server/parlays";

type MeResponse = {
  user: { id: string; username: string; balance: number };
};

type LeaderboardResponse = {
  rows: LeaderboardRow[];
  mean: number | null;
};

type RandomParlaysResponse = {
  parlays: RandomParlaySummary[];
};

export function LeaderboardClient() {
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [parlays, setParlays] = useState<RandomParlaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch("/api/me").then(async (r) => {
        if (!r.ok) throw new Error("ME_REQUEST_FAILED");
        const body = (await r.json()) as MeResponse;
        return body.user.username;
      }),
      fetch("/api/leaderboard").then(async (r) => {
        if (!r.ok) throw new Error("LEADERBOARD_REQUEST_FAILED");
        return (await r.json()) as LeaderboardResponse;
      }),
      fetch("/api/parlays/random?limit=3").then(async (r) => {
        if (!r.ok) return [];
        const body = (await r.json()) as RandomParlaysResponse;
        return body.parlays ?? [];
      })
    ])
      .then(([username, lb, parlaysData]) => {
        if (!active) return;
        setCurrentUsername(username);
        setLeaderboard(lb);
        setParlays(parlaysData);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading leaderboard&hellip;</p>;
  }

  return (
    <>
      {leaderboard ? (
        <LeaderboardTable
          rows={leaderboard.rows}
          mean={leaderboard.mean}
          currentUsername={currentUsername ?? ""}
        />
      ) : (
        <p className="text-sm text-slate-500">Could not load leaderboard.</p>
      )}
      <RandomParlaysModule parlays={parlays} />
    </>
  );
}
