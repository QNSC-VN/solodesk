/**
 * Vietnam wall-clock helpers — the ONE home for UTC+7 boundary math
 * (fixed offset, no DST). Three modules had private copies of the same
 * `-7h` shift (tax-filing's filing-period, expenses' month window,
 * tax-estimate's year window) and they had already diverged in one
 * place (UTC year boundary vs VN-local year boundary for the same
 * "cumulative revenue this year" concept). Dates that are plain
 * calendar dates (YYYY-MM-DD) use UTC-midnight instants after the
 * shift; callers comparing against timestamptz columns get windows
 * that align with what a person in Vietnam calls "today/this
 * quarter/this year".
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** The Vietnam-local calendar date of an instant, as YYYY-MM-DD. */
export function vnDateKey(asOf: Date): string {
  return new Date(asOf.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** The Vietnam-local quarter AND year `asOf` falls in (the pair callers actually need together). */
export function currentQuarterOf(asOf: Date): { quarter: number; year: number } {
  const key = vnDateKey(asOf);
  const month = Number(key.slice(5, 7));
  return { quarter: Math.floor((month - 1) / 3) + 1, year: Number(key.slice(0, 4)) };
}

/** [startUtc, endUtc) of a Vietnam-local quarter. */
export function quarterWindowUtc(quarter: number, year: number): { start: Date; end: Date } {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1) - VN_OFFSET_MS);
  const end = new Date(Date.UTC(year, startMonth + 3, 1) - VN_OFFSET_MS);
  return { start, end };
}

/** [startUtc, endUtc) of a Vietnam-local calendar year. */
export function yearWindowUtc(year: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, 0, 1) - VN_OFFSET_MS);
  const end = new Date(Date.UTC(year + 1, 0, 1) - VN_OFFSET_MS);
  return { start, end };
}

/** [startUtc, endUtc) of the Vietnam-local calendar month containing `asOf`. */
export function monthWindowUtc(asOf: Date): { start: Date; end: Date } {
  const key = vnDateKey(asOf);
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const start = new Date(Date.UTC(year, month - 1, 1) - VN_OFFSET_MS);
  const end = new Date(Date.UTC(year, month, 1) - VN_OFFSET_MS);
  return { start, end };
}

/** Whole days from `asOf` until a plain calendar date (negative = past). Calendar-date arithmetic — no time component, no rounding drift. */
export function daysUntil(asOf: Date, dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00Z`).getTime();
  const today = new Date(`${vnDateKey(asOf)}T00:00:00Z`).getTime();
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
}
