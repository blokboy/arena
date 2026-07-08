"use client";

import React from "react";

import { cn } from "@/lib/cn";
import type { ParlayWizardStep } from "@/components/parlays/types";

type StepConfig = {
  key: ParlayWizardStep;
  label: string;
  description: string;
};

type WizardStepIndicatorProps = {
  currentStep: ParlayWizardStep;
  className?: string;
  steps?: readonly StepConfig[];
};

const DEFAULT_STEPS: readonly StepConfig[] = [
  {
    key: "roster",
    label: "Roster",
    description: "Name the parlay and lock the member list"
  },
  {
    key: "first-leg",
    label: "First leg",
    description: "Pick the market and commit existing shares"
  }
];

export function WizardStepIndicator({
  currentStep,
  className,
  steps = DEFAULT_STEPS
}: WizardStepIndicatorProps) {
  const currentIndex = steps.findIndex((step) => step.key === currentStep);

  return (
    <ol aria-label="Parlay creation steps" className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {steps.map((step, index) => {
        const isActive = step.key === currentStep;
        const isComplete = currentIndex > index;

        return (
          <li
            key={step.key}
            className={cn(
              "rounded-lg border px-4 py-3 transition-colors",
              isActive && "border-slate-900 bg-slate-950 text-white",
              isComplete && !isActive && "border-emerald-200 bg-emerald-50 text-slate-900",
              !isActive && !isComplete && "border-slate-200 bg-white text-slate-700"
            )}
            aria-current={isActive ? "step" : undefined}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isActive && "bg-white text-slate-950",
                  isComplete && !isActive && "bg-emerald-600 text-white",
                  !isActive && !isComplete && "bg-slate-100 text-slate-500"
                )}
              >
                {index + 1}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{step.label}</p>
                <p className={cn("mt-0.5 text-xs", isActive ? "text-slate-200" : "text-slate-500")}>
                  {step.description}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
