import React from "react";

type HouseBalanceStatProps = {
  houseBalance: string;
};

export function HouseBalanceStat({ houseBalance }: HouseBalanceStatProps) {
  const balance = Number(houseBalance);
  const bonusPool = balance / 2;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">HOUSE balance</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{formatNumber(balance)}</p>
      <p className="mt-1 text-xs text-slate-500">
        50% ({formatNumber(bonusPool)}) is today&apos;s bonus pool
      </p>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}
