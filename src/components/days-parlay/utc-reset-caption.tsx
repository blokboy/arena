"use client";

import React, { useEffect, useState } from "react";

export function UtcResetCaption() {
  const [caption, setCaption] = useState<string | null>(null);

  useEffect(() => {
    setCaption(computeResetCaption());

    const interval = setInterval(() => {
      setCaption(computeResetCaption());
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  if (!caption) {
    return null;
  }

  return (
    <p className="text-xs text-slate-500">{caption}</p>
  );
}

function computeResetCaption(): string {
  const now = new Date();
  const nextMidnightUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  const diffMs = nextMidnightUtc.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  if (hours > 0) {
    return `Resets at midnight UTC in ${hours}h ${minutes}m`;
  }
  return `Resets at midnight UTC in ${minutes}m`;
}
