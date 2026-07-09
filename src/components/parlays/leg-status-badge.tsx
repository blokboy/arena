import React from "react";
import { Ban, Check, Clock, Radio, RotateCcw, X, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

export type LegStatus =
  | "PENDING"
  | "ACTIVE"
  | "RESOLVED_WON"
  | "RESOLVED_LOST"
  | "ROLLED_OVER"
  | "VOIDED"
  // The real, shipped ParlayLeg.status enum uses WON/LOST (matching
  // ParlayStatus's established naming) rather than the PRD's
  // RESOLVED_WON/RESOLVED_LOST — both render identically here.
  | "WON"
  | "LOST";

export type LegStakeStatus =
  | "PENDING"
  | "ACTIVE"
  | "RESOLVED_WON"
  | "RESOLVED_LOST"
  | "ROLLED_OVER"
  | "VOIDED_REFUNDED"
  // The real, shipped LegStake.status enum uses WON/LOST (confirmed by
  // Backend for issue #11 — see docs/prds/points-prediction-market.md
  // Part III §5) rather than the PRD's RESOLVED_WON/RESOLVED_LOST — both
  // render identically here, same convention as LegStatus above.
  | "WON"
  | "LOST";

type StatusConfig = {
  label: string;
  icon: LucideIcon;
  iconTestId: string;
  badgeClassName: string;
};

// LegStatus and LegStakeStatus intentionally share this visual vocabulary
// (PRD Part IV §4.2) — VOIDED_REFUNDED renders identically to VOIDED.
const STATUS_CONFIG: Record<LegStatus | LegStakeStatus, StatusConfig> = {
  WON: {
    label: "Won",
    icon: Check,
    iconTestId: "leg-status-icon-won",
    badgeClassName: "border border-emerald-600 bg-emerald-50 text-emerald-600"
  },
  LOST: {
    label: "Lost",
    icon: X,
    iconTestId: "leg-status-icon-lost",
    badgeClassName: "border border-red-600 bg-red-50 text-red-600"
  },
  PENDING: {
    label: "Pending, locked",
    icon: Clock,
    iconTestId: "leg-status-icon-pending",
    badgeClassName: "border border-dashed border-slate-300 text-slate-500"
  },
  ACTIVE: {
    label: "Live",
    icon: Radio,
    iconTestId: "leg-status-icon-active",
    badgeClassName: "border border-blue-500 bg-blue-50 text-blue-600"
  },
  RESOLVED_WON: {
    label: "Won",
    icon: Check,
    iconTestId: "leg-status-icon-won",
    badgeClassName: "border border-emerald-600 bg-emerald-50 text-emerald-600"
  },
  RESOLVED_LOST: {
    label: "Lost",
    icon: X,
    iconTestId: "leg-status-icon-lost",
    badgeClassName: "border border-red-600 bg-red-50 text-red-600"
  },
  ROLLED_OVER: {
    label: "Rolled over",
    icon: RotateCcw,
    iconTestId: "leg-status-icon-rolled-over",
    badgeClassName: "border border-violet-500 bg-violet-50 text-violet-600"
  },
  VOIDED: {
    label: "Voided, refunded",
    icon: Ban,
    iconTestId: "leg-status-icon-voided",
    badgeClassName: "border border-slate-300 bg-slate-50 text-slate-500"
  },
  VOIDED_REFUNDED: {
    label: "Voided, refunded",
    icon: Ban,
    iconTestId: "leg-status-icon-voided",
    badgeClassName: "border border-slate-300 bg-slate-50 text-slate-500"
  }
};

type LegStatusBadgeProps = {
  status: LegStatus | LegStakeStatus;
  reducedMotion?: boolean;
};

export function LegStatusBadge({ status, reducedMotion = false }: LegStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        config.badgeClassName
      )}
    >
      {status === "ACTIVE" ? (
        <span
          data-testid="leg-status-live-dot"
          className={cn(
            "h-2 w-2 rounded-full bg-blue-500",
            reducedMotion ? "ring-2 ring-blue-300" : "animate-pulse"
          )}
          aria-hidden="true"
        />
      ) : null}
      <Icon
        data-testid={config.iconTestId}
        data-lucide-icon={config.iconTestId}
        className="h-3.5 w-3.5"
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}
