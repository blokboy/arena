"use client";

import React from "react";

import { EligiblePositionCommitSelector } from "@/components/parlays/eligible-position-commit-selector";
import { ParlayRosterStep } from "@/components/parlays/parlay-roster-step";
import { WizardStepIndicator } from "@/components/parlays/wizard-step-indicator";
import type {
  EligiblePositionLot,
  ParlayRosterMember,
  ParlayUserSearchResult,
  ParlayWizardStep,
  SelectedCommitments
} from "@/components/parlays/types";

type CreateParlayWizardProps = {
  step: ParlayWizardStep;
  name: string;
  searchQuery: string;
  selectedMembers: readonly ParlayRosterMember[];
  searchResults: readonly ParlayUserSearchResult[];
  lots: readonly EligiblePositionLot[];
  selectedCommitments: SelectedCommitments;
  rosterError?: string | null;
  nameError?: string | null;
  commitError?: string | null;
  disabled?: boolean;
  onNameChange?: (name: string) => void;
  onSearchQueryChange?: (query: string) => void;
  onAddMember?: (user: ParlayUserSearchResult) => void;
  onRemoveMember?: (userId: string) => void;
  onCommitmentChange?: (positionId: string, shares: string) => void;
  onBack?: () => void;
  onNext?: () => void;
  onSubmit?: () => void;
};

export function CreateParlayWizard({
  step,
  name,
  searchQuery,
  selectedMembers,
  searchResults,
  lots,
  selectedCommitments,
  rosterError,
  nameError,
  commitError,
  disabled,
  onNameChange,
  onSearchQueryChange,
  onAddMember,
  onRemoveMember,
  onCommitmentChange,
  onBack,
  onNext,
  onSubmit
}: CreateParlayWizardProps) {
  return (
    <section className="space-y-5">
      <WizardStepIndicator currentStep={step} />

      {step === "roster" ? (
        <ParlayRosterStep
          name={name}
          searchQuery={searchQuery}
          selectedMembers={selectedMembers}
          searchResults={searchResults}
          rosterError={rosterError}
          nameError={nameError}
          disabled={disabled}
          onNameChange={onNameChange}
          onSearchQueryChange={onSearchQueryChange}
          onAddMember={onAddMember}
          onRemoveMember={onRemoveMember}
        />
      ) : (
        <EligiblePositionCommitSelector
          lots={lots}
          selectedCommitments={selectedCommitments}
          errorMessage={commitError}
          disabled={disabled}
          onCommitmentChange={onCommitmentChange}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={disabled || step === "roster"}
          className="min-h-11 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Back
        </button>

        {step === "roster" ? (
          <button
            type="button"
            onClick={onNext}
            disabled={disabled}
            className="min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue to first leg
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled}
            className="min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create parlay
          </button>
        )}
      </div>
    </section>
  );
}
