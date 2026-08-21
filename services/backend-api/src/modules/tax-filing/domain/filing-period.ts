/**
 * The tax-filing calendar rules, Asia/Ho_Chi_Minh (fixed UTC+7, no DST).
 * The generic window math lives in ONE place — `platform/vn-time.ts` —
 * shared with expenses' month window, tax-estimate's year window, and
 * compliance's day counting; this file keeps only what is
 * tax-filing-specific (the deadline rule) plus re-exports so existing
 * callers read one vocabulary.
 */
import { currentQuarterOf, quarterWindowUtc as platformQuarterWindowUtc } from '../../../platform/vn-time';

export { quarterWindowUtc } from '../../../platform/vn-time';

/** The calendar quarter/year `asOf` falls in, read as Asia/Ho_Chi_Minh wall-clock. */
export function currentQuarter(asOf: Date): { quarter: number; year: number } {
  return currentQuarterOf(asOf);
}

/** Kept as an alias: the platform name is the canonical one. */
export const quarterWindow = platformQuarterWindowUtc;

/**
 * The mockup's own rule (`sm-domain.js`'s `deadlines()`), ported verbatim:
 * "last calendar day of the first month of the next quarter." Returned as
 * a nominal VN calendar date (midnight UTC, not offset-adjusted) — this is
 * a display/countdown deadline, not an instant boundary, so day-precision
 * is all that's needed.
 */
export function filingDeadline(quarter: number, year: number): Date {
  const m = quarter * 3 + 1; // first month of next quarter, 1-indexed
  if (m > 12) return new Date(Date.UTC(year + 1, 0, 31));
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return new Date(Date.UTC(year, m - 1, lastDay));
}
