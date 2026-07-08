"use client";

import React, { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";
import { formatPoints } from "@/lib/money";

type SellAllDialogProps = {
  open: boolean;
  lotCount: number;
  availableShares: string;
  estimatedValue: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  pending?: boolean;
  errorMessage?: string | null;
};

export function SellAllDialog({
  open,
  lotCount,
  availableShares,
  estimatedValue,
  onConfirm,
  onCancel,
  pending,
  errorMessage
}: SellAllDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      cancelRef.current?.focus();
    } else if (previousActiveElement.current) {
      previousActiveElement.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
        return;
      }

      if (event.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Sell all available shares?"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-slate-950">Sell all available shares?</h2>

        <p className="mt-2 text-sm text-slate-600">
          You will sell {lotCount} purchase{lotCount !== 1 ? "s" : ""} of this position,{" "}
          {availableShares} available shares total, at the current sell price.
        </p>

        <p className="mt-1 text-sm text-slate-500">
          Estimated proceeds: {formatPoints(Number(estimatedValue))} points.
        </p>

        <p className="mt-1 text-xs text-slate-400">
          Shares locked into parlays are not included.
        </p>

        {errorMessage ? (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            disabled={pending}
            onClick={onCancel}
            className={cn(
              "min-h-11 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700",
              "hover:border-slate-400",
              pending && "cursor-not-allowed opacity-60"
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={cn(
              "min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white",
              "hover:bg-primary/90",
              pending && "cursor-not-allowed opacity-60"
            )}
          >
            {pending ? "Selling…" : "Sell all available"}
          </button>
        </div>
      </div>
    </div>
  );
}
