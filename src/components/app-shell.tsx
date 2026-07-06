"use client";

import React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";

import { formatPoints } from "@/lib/money";
import { cn } from "@/lib/cn";

type AppShellProps = {
  currentPath: string;
  user: {
    id: string;
    username: string;
    balance: number;
    showStartingBalance?: boolean;
  };
  children: React.ReactNode;
};

const navItems = [
  { href: "/markets", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/parlays", label: "Parlays" },
  { href: "/days-parlay", label: "Day's Parlay" },
  { href: "/leaderboard", label: "Leaderboard" }
] as const;

export function AppShell({ currentPath, user, children }: AppShellProps) {
  const bannerStorageKey = `arena:starting-balance-banner:${user.id}`;
  const [showStartingBalanceBanner, setShowStartingBalanceBanner] = useState(
    Boolean(user.showStartingBalance)
  );

  useEffect(() => {
    if (!user.showStartingBalance) {
      setShowStartingBalanceBanner(false);
      return;
    }

    setShowStartingBalanceBanner(
      globalThis.localStorage?.getItem(bannerStorageKey) !== "dismissed"
    );
  }, [bannerStorageKey, user.showStartingBalance]);

  function dismissStartingBalanceBanner() {
    globalThis.localStorage?.setItem(bannerStorageKey, "dismissed");
    setShowStartingBalanceBanner(false);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Arena</p>
            <p className="text-sm text-slate-600">Signed in as {user.username}</p>
          </div>
          <nav aria-label="Main navigation" className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const isCurrent =
                currentPath === item.href || currentPath.startsWith(`${item.href}/`);

              return (
                <Link
                  aria-current={isCurrent ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium",
                    isCurrent
                      ? "bg-primary text-white"
                      : "border border-slate-200 bg-white text-slate-700"
                  )}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              Balance <strong>{formatPoints(user.balance)}</strong>
            </div>
            <form action="/api/auth/logout" method="post">
              <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">
        {showStartingBalanceBanner ? (
          <section className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-medium">You are starting with 1,000 points.</h2>
                <p className="mt-1 text-sm text-slate-700">Use them across markets and parlays.</p>
              </div>
              <button
                aria-label="Dismiss starting balance banner"
                className="self-start rounded-md border border-amber-300 bg-white px-3 py-1 text-sm font-medium text-slate-700"
                onClick={dismissStartingBalanceBanner}
                type="button"
              >
                Dismiss
              </button>
            </div>
          </section>
        ) : null}
        {children}
      </main>
    </div>
  );
}
