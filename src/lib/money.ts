export const STARTING_BALANCE = 1000;
export const BANKRUPTCY_STIPEND = 200;

export function roundPoints(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatPoints(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(value);
}
