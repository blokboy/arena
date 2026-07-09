import React from "react";

const MAX_DAILY_ROLLOVERS = 3;

type RolloverCounterProps = {
  rolloverCount: number;
};

export function RolloverCounter({ rolloverCount }: RolloverCounterProps) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">
        {rolloverCount} of {MAX_DAILY_ROLLOVERS} rollovers used today
      </p>
    </div>
  );
}
