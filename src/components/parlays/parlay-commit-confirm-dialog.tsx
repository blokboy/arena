"use client";

import React, { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

type ParlayCommitConfirmDialogProps = {
  open: boolean;
  title: string;
  commitmentSummary: string;
  lockedWarning: string;
  houseRiskCopy: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  errorMessage?: string | null;
  children?: React.ReactNode;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
};

export function ParlayCommitConfirmDialog({
  open,
  title,
  commitmentSummary,
  lockedWarning,
  houseRiskCopy,
  confirmLabel = "Commit shares",
  cancelLabel = "Cancel",
  pending,
  errorMessage,
  children,
  onConfirm,
  onCancel
}: ParlayCommitConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement | null;
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
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{commitmentSummary}</p>

        <div className="mt-4 space-y-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-950">Locked immediately</p>
          <p className="text-sm leading-6 text-amber-950">{lockedWarning}</p>
          <p className="text-sm leading-6 text-amber-950">{houseRiskCopy}</p>
        </div>

        {children ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">{children}</div>
        ) : null}

        {errorMessage ? (
          <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className={cn(
              "min-h-11 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700",
              "hover:border-slate-400",
              pending && "cursor-not-allowed opacity-60"
            )}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cn(
              "min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white",
              "hover:bg-slate-800",
              pending && "cursor-not-allowed opacity-60"
            )}
          >
            {pending ? "Committing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
