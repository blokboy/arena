"use client";

import React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { CachedMarket } from "@/domain/markets";
import { divideDecimalStrings } from "@/domain/positions";
import { cn } from "@/lib/cn";
import { formatPoints } from "@/lib/money";

export type BuyPanelProps = {
  market: CachedMarket;
  balance: number;
};

type SuccessState = {
  shares: string;
  stake: string;
  outcomeLabel: string;
  balance: number;
};

const STALE_THRESHOLD_MS = 90_000;
const STALE_RECHECK_INTERVAL_MS = 30_000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const STAKE_PATTERN = /^(?:\d+|\d*\.\d{1,2})$/;
const SHARES_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function BuyPanel({ market, balance }: BuyPanelProps) {
  const router = useRouter();
  const isBinary = market.outcomes.length === 2;

  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState<number | null>(
    isBinary ? 0 : null
  );
  const [stake, setStake] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), STALE_RECHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  if (market.closed) {
    return (
      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">Buy position</h2>
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
          This market is closed. Buying is unavailable.
        </p>
      </section>
    );
  }

  if (!market.active) {
    return (
      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">Buy position</h2>
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
          This market is inactive right now. Buying is unavailable.
        </p>
      </section>
    );
  }

  const stalenessMessage = computeStalenessMessage(market.lastSyncedAt, nowMs);

  if (market.bestAsk === null) {
    return (
      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">Buy position</h2>
        <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
          No buy price available right now. Check back after the next price sync.
        </p>
        {stalenessMessage ? <p className="text-xs text-slate-500">{stalenessMessage}</p> : null}
      </section>
    );
  }

  const bestAsk = market.bestAsk;
  const trimmedStake = stake.trim();
  const hasValidFormat = STAKE_PATTERN.test(trimmedStake);
  const stakeNumber = hasValidFormat ? Number(trimmedStake) : null;
  const isStakeValid =
    hasValidFormat && stakeNumber !== null && stakeNumber >= 1 && stakeNumber <= balance;
  const stakeErrorMessage = getStakeErrorMessage(
    trimmedStake,
    hasValidFormat,
    stakeNumber,
    balance
  );
  const outcomeChosen = selectedOutcomeIndex !== null;
  const canSubmit = outcomeChosen && isStakeValid && !isSubmitting;
  const formDisabled = isSubmitting || !outcomeChosen;

  const sharesPreview =
    outcomeChosen && isStakeValid ? computeSharesPreview(trimmedStake, bestAsk) : null;
  const outcomeLabel = selectedOutcomeIndex !== null ? market.outcomes[selectedOutcomeIndex] : null;

  function selectOutcome(index: number) {
    setSelectedOutcomeIndex(index);
    setSuccess(null);
  }

  function handleStakeChange(value: string) {
    setStake(value);
    setSuccess(null);
  }

  function handleMax() {
    setStake(formatStakeInput(balance));
    setSuccess(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || selectedOutcomeIndex === null) {
      return;
    }

    setIsSubmitting(true);
    setErrorCode(null);

    try {
      const response = await fetch("/api/positions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          marketId: market.gammaId,
          outcomeIndex: selectedOutcomeIndex,
          stake: trimmedStake
        })
      });

      const body = (await response.json().catch(() => undefined)) as
        | {
            error?: { code?: string };
            position?: { shares?: string; outcomeLabel?: string };
            balance?: number;
          }
        | undefined;

      if (!response.ok) {
        setErrorCode(body?.error?.code ?? "UNKNOWN");
        return;
      }

      setSuccess({
        shares: body?.position?.shares ?? "0",
        stake: trimmedStake,
        outcomeLabel: body?.position?.outcomeLabel ?? outcomeLabel ?? "",
        balance: body?.balance ?? balance
      });
      setStake("");
      router.refresh();
    } catch {
      setErrorCode("NETWORK_ERROR");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-950">Buy position</h2>

      <div>
        <div className="rounded-md bg-emerald-50 px-3 py-2">
          <p className="text-xs font-medium text-emerald-700">Buy price</p>
          <p className="mt-0.5 text-2xl font-semibold text-emerald-900">
            {bestAsk}{" "}
            <span className="text-sm font-medium text-emerald-700">
              points per share · {formatPercent(bestAsk)}
            </span>
          </p>
        </div>
        {stalenessMessage ? (
          <p className="mt-1 text-xs text-slate-500">{stalenessMessage}</p>
        ) : null}
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <p className="text-sm font-medium text-slate-950">Outcome</p>
          <div
            role="group"
            aria-label="Outcome"
            className={isBinary ? "mt-2 grid grid-cols-2 gap-2" : "mt-2 space-y-2"}
          >
            {market.outcomes.map((outcome, index) => {
              const selected = selectedOutcomeIndex === index;
              const percent = formatPercent(market.outcomePrices[index]);

              return (
                <button
                  key={`${market.gammaId}-${outcome}`}
                  type="button"
                  aria-pressed={selected}
                  disabled={isSubmitting}
                  onClick={() => selectOutcome(index)}
                  className={cn(
                    "min-h-11 rounded-md border px-3 py-2 text-sm font-medium transition",
                    !isBinary && "flex w-full items-center justify-between",
                    selected
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                  )}
                >
                  {isBinary ? (
                    `${outcome} · ${percent}`
                  ) : (
                    <>
                      <span>{outcome}</span>
                      <span>{percent}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          {!isBinary && !outcomeChosen ? (
            <p className="mt-2 text-xs text-slate-500">Choose an outcome to continue.</p>
          ) : null}
        </div>

        <div>
          <label className="block" htmlFor="buy-panel-stake">
            <span className="text-sm font-medium text-slate-950">Stake</span>
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="buy-panel-stake"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-right"
              value={stake}
              disabled={formDisabled}
              aria-invalid={stakeErrorMessage ? "true" : undefined}
              aria-describedby={stakeErrorMessage ? "stake-error" : "stake-help"}
              onChange={(event) => handleStakeChange(event.target.value)}
            />
            <button
              type="button"
              disabled={formDisabled}
              aria-label={`Set stake to maximum, ${formatPoints(balance)} points`}
              onClick={handleMax}
              className="min-h-11 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
            >
              Max
            </button>
          </div>
          {stakeErrorMessage ? (
            <p id="stake-error" className="mt-1 text-xs text-red-700">
              {stakeErrorMessage}
            </p>
          ) : (
            <p id="stake-help" className="mt-1 text-xs text-slate-500">
              You can stake up to {formatPoints(balance)} points.
            </p>
          )}
        </div>

        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm" aria-live="polite">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500">Shares</span>
            <span className="font-medium text-slate-900">
              {sharesPreview ? `≈ ${formatShares(sharesPreview)}` : "—"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-4">
            <span className="text-slate-500">Pays if {outcomeLabel ?? "outcome"} wins</span>
            <span className="font-medium text-slate-900">
              {sharesPreview ? `≈ ${formatShares(sharesPreview)} points` : "—"}
            </span>
          </div>
        </div>

        {errorCode ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {getApiErrorMessage(errorCode, balance)}
          </p>
        ) : null}

        {success ? (
          <div
            role="status"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          >
            <p>
              Bought ≈ {formatShares(success.shares)} {success.outcomeLabel} shares for{" "}
              {success.stake} points.
            </p>
            <p>New balance: {formatPoints(success.balance)} points.</p>
            <Link href="/portfolio" className="font-medium text-emerald-900 underline">
              View portfolio
            </Link>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full min-h-11 rounded-md bg-primary px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting
            ? "Buying…"
            : canSubmit && outcomeLabel
              ? `Buy ${outcomeLabel} for ${trimmedStake} points`
              : "Buy"}
        </button>
      </form>
    </section>
  );
}

function getStakeErrorMessage(
  trimmedStake: string,
  hasValidFormat: boolean,
  stakeNumber: number | null,
  balance: number
): string | null {
  if (trimmedStake === "") {
    return null;
  }
  if (!hasValidFormat) {
    return `Enter a stake between 1 and ${formatPoints(balance)} points.`;
  }
  if (stakeNumber !== null && stakeNumber > balance) {
    return `That's more than your ${formatPoints(balance)}-point balance.`;
  }
  if (stakeNumber !== null && stakeNumber < 1) {
    return `Enter a stake between 1 and ${formatPoints(balance)} points.`;
  }
  return null;
}

function getApiErrorMessage(code: string, balance: number): string {
  if (code === "INSUFFICIENT_BALANCE") {
    return `Your balance is ${formatPoints(balance)} points — lower your stake.`;
  }
  if (code === "MARKET_CLOSED" || code === "MARKET_INACTIVE" || code === "PRICE_UNAVAILABLE") {
    return "This market can't be bought right now. Prices may be re-syncing.";
  }
  return "Purchase failed and no points were deducted. Try again.";
}

function computeSharesPreview(stake: string, bestAsk: string): string {
  return divideDecimalStrings(stake, bestAsk);
}

function formatShares(value: string): string {
  return SHARES_FORMATTER.format(Number(floorToTwoDecimals(value)));
}

function floorToTwoDecimals(value: string): string {
  const [integerPart, fractionPart = ""] = value.split(".");
  const truncatedFraction = fractionPart.slice(0, 2);
  return truncatedFraction.length > 0 ? `${integerPart}.${truncatedFraction}` : integerPart;
}

function formatStakeInput(balance: number): string {
  if (Number.isInteger(balance)) {
    return String(balance);
  }
  return balance.toFixed(2);
}

function computeStalenessMessage(lastSyncedAt: string, nowMs: number): string | null {
  const ageMs = nowMs - new Date(lastSyncedAt).getTime();
  if (ageMs <= STALE_THRESHOLD_MS) {
    return null;
  }
  if (ageMs >= ONE_HOUR_MS) {
    return "Prices synced over an hour ago — the live price may have moved.";
  }
  const minutes = Math.max(1, Math.floor(ageMs / 60_000));
  return `Prices synced ${minutes}m ago — the live price may have moved.`;
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
