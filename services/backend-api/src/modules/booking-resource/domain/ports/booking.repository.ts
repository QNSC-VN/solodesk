import type { Booking, RequestHoldInput } from '../booking.types';

export const BOOKING_REPOSITORY = Symbol('BOOKING_REPOSITORY');

export interface IBookingRepository {
  findById(id: string, tenantId: string): Promise<Booking | null>;
  listByResource(resourceId: string, tenantId: string): Promise<Booking[]>;
  /**
   * `null` = capacity unavailable for the requested window — same
   * "repository returns null on a failed guard, service decides that's a
   * ConflictException" convention as `LotDrizzleRepository`. Reads the
   * resource's capacity itself, inside the same advisory-locked
   * transaction as the overlap check — see the implementation's header
   * comment for why a lock is needed here and a guarded UPDATE isn't enough.
   */
  requestHold(tenantId: string, input: RequestHoldInput): Promise<Booking | null>;
  /** `null` = the hold is missing, already resolved, or expired. */
  confirm(id: string, tenantId: string): Promise<Booking | null>;
  /** `null` = the booking isn't in a cancellable state (`held`/`confirmed`). */
  cancel(id: string, tenantId: string): Promise<Booking | null>;
  /** `null` = the booking isn't `confirmed` (no-show only applies to a confirmed booking). */
  markNoShow(id: string, tenantId: string): Promise<Booking | null>;
}
