"use client";

import React from "react";

import { cn } from "@/lib/cn";

type LockedShareValueProps = {
  lockedShares: string;
  availableShares: string;
  className?: string;
};

export function LockedShareValue({
  lockedShares,
  availableShares,
  className
}: LockedShareValueProps) {
  if (lockedShares === "0") {
    return null;
  }

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-slate-400", className)}>
      <LockIcon aria-hidden="true" />
      <span>
        {lockedShares} locked
        {availableShares !== "0" ? " · not sellable" : ""}
      </span>
    </span>
  );
}

function LockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
