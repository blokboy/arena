"use client";

import React from "react";
import { Plus, Search, X } from "lucide-react";

import { RosterLockNotice } from "@/components/parlays/roster-lock-notice";
import { cn } from "@/lib/cn";
import type { ParlayRosterMember, ParlayUserSearchResult } from "@/components/parlays/types";

type ParlayRosterStepProps = {
  name: string;
  searchQuery: string;
  selectedMembers: readonly ParlayRosterMember[];
  searchResults: readonly ParlayUserSearchResult[];
  nameError?: string | null;
  rosterError?: string | null;
  disabled?: boolean;
  className?: string;
  onNameChange?: (name: string) => void;
  onSearchQueryChange?: (query: string) => void;
  onAddMember?: (user: ParlayUserSearchResult) => void;
  onRemoveMember?: (userId: string) => void;
};

export function ParlayRosterStep({
  name,
  searchQuery,
  selectedMembers,
  searchResults,
  nameError,
  rosterError,
  disabled,
  className,
  onNameChange,
  onSearchQueryChange,
  onAddMember,
  onRemoveMember
}: ParlayRosterStepProps) {
  return (
    <section className={cn("space-y-5 rounded-xl border border-slate-200 bg-white p-5", className)}>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-500">Step 1 of 2</p>
        <h2 className="text-xl font-semibold text-slate-950">Roster</h2>
        <p className="text-sm leading-6 text-slate-600">
          Name the parlay and choose the fixed formal-member roster before anyone commits shares.
        </p>
      </div>

      <RosterLockNotice />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-800">Parlay name</span>
          <input
            value={name}
            onChange={(event) => onNameChange?.(event.target.value)}
            disabled={disabled}
            className={cn(
              "min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm",
              "placeholder:text-slate-400 focus:border-slate-900 focus:outline-none",
              disabled && "cursor-not-allowed bg-slate-50 opacity-70"
            )}
            placeholder="Monday crew"
          />
          {nameError ? (
            <p role="alert" className="text-sm text-red-700">
              {nameError}
            </p>
          ) : null}
        </label>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-800">Locked roster</p>
          <p className="mt-1 text-sm text-slate-600">
            {selectedMembers.length} member{selectedMembers.length === 1 ? "" : "s"} selected
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedMembers.length > 0 ? (
              selectedMembers.map((member) => (
                <span
                  key={member.id}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700"
                >
                  <span className="font-medium text-slate-950">{member.username}</span>
                  {onRemoveMember ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onRemoveMember(member.id)}
                      className={cn(
                        "rounded-full p-0.5 text-slate-400 hover:text-slate-700",
                        disabled && "cursor-not-allowed opacity-50"
                      )}
                      aria-label={`Remove ${member.username}`}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
              ))
            ) : (
              <p className="text-sm text-slate-500">No members selected yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-800">Find users</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange?.(event.target.value)}
              disabled={disabled}
              className={cn(
                "min-h-11 w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm",
                "placeholder:text-slate-400 focus:border-slate-900 focus:outline-none",
                disabled && "cursor-not-allowed bg-slate-50 opacity-70"
              )}
              placeholder="Search by username"
            />
          </div>
        </label>

        <div className="rounded-lg border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-medium text-slate-800">Search results</p>
            <p className="mt-1 text-xs text-slate-500">
              Select stable user IDs here; usernames are only for display.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {searchResults.length > 0 ? (
              searchResults.map((user) => {
                const alreadySelected = selectedMembers.some((member) => member.id === user.id);

                return (
                  <button
                    key={user.id}
                    type="button"
                    disabled={disabled || alreadySelected}
                    aria-label={`${alreadySelected ? "Added" : "Add"} ${user.username}`}
                    onClick={() => onAddMember?.(user)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-3 text-left",
                      "hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
                      alreadySelected && "bg-emerald-50"
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-950">{user.username}</p>
                      {user.subtitle ? (
                        <p className="mt-0.5 text-xs text-slate-500">{user.subtitle}</p>
                      ) : null}
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {alreadySelected ? "Added" : "Add"}
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="px-4 py-6 text-sm text-slate-500">No matching users yet.</p>
            )}
          </div>
        </div>
      </div>

      {rosterError ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {rosterError}
        </p>
      ) : null}
    </section>
  );
}
