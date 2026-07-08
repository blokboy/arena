"use client";

import React from "react";

import { BANKRUPTCY_STIPEND } from "@/lib/money";

type StipendNoticeProps = {
  granted: boolean;
  onDismiss: () => void;
};

export function StipendNotice({ granted, onDismiss }: StipendNoticeProps) {
  if (!granted) return null;

  return (
    <section className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-medium">Bankruptcy stipend received</h2>
          <p className="mt-1 text-sm text-slate-700">
            The daily UTC stipend added +{BANKRUPTCY_STIPEND} points because your balance was at or
            below 0.
          </p>
        </div>
        <button
          aria-label="Dismiss bankruptcy stipend notice"
          className="self-start rounded-md border border-amber-300 bg-white px-3 py-1 text-sm font-medium text-slate-700"
          onClick={onDismiss}
          type="button"
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}
