"use client";

import React from "react";

import { cn } from "@/lib/cn";

type RosterLockNoticeProps = {
  className?: string;
};

export function RosterLockNotice({ className }: RosterLockNoticeProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950",
        className
      )}
    >
      <p className="text-sm font-semibold">Members can&apos;t be added later.</p>
      <p className="mt-1 text-sm leading-6">
        Members can&apos;t be added later — only added members can append legs.
      </p>
      <p className="mt-1 text-sm leading-6">
        This roster is fixed at creation. It is a one-time, consequential choice: only the selected
        members can append legs later.
      </p>
    </div>
  );
}
