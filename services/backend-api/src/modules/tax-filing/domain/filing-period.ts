/**
 * Pure calendar-quarter math, Asia/Ho_Chi_Minh (fixed UTC+7, no DST — no
 * timezone library needed for a VN-only app). Shared by
 * `TaxEstimateService` (the read path) and the filing-deadline sweep (the
 * reminder path) so both agree on exactly the same quarter windows.
 */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** The calendar quarter/year `asOf` falls in, read as Asia/Ho_Chi_Minh wall-clock. */
export function currentQuarter(asOf: Date): { quarter: number; year: number } {
  const vn = new Date(asOf.getTime() + VN_OFFSET_MS);
  return { quarter: Math.floor(vn.getUTCMonth() / 3) + 1, year: vn.getUTCFullYear() };
}

/** Half-open `[start, end)` UTC instants spanning the given VN calendar quarter. */
export function quarterWindowUtc(quarter: number, year: number): { start: Date; end: Date } {
  const startMonth = (quarter - 1) * 3; // 0-indexed
  const start = new Date(Date.UTC(year, startMonth, 1, -7, 0, 0));
  const wraps = startMonth + 3 >= 12;
  const end = new Date(Date.UTC(wraps ? year + 1 : year, (startMonth + 3) % 12, 1, -7, 0, 0));
  return { start, end };
}

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
