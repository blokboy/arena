export function freezeClock(iso: string) {
  return new Date(iso);
}

export function utcDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
