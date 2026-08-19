export type BookingStatus = 'held' | 'confirmed' | 'cancelled' | 'no_show' | 'completed';

export interface Resource {
  id: string;
  tenantId: string;
  name: string;
  resourceType: string;
  capacity: number;
  isActive: boolean;
}

export interface CreateResourceInput {
  name: string;
  resourceType: string;
  capacity: number;
}

export interface Booking {
  id: string;
  tenantId: string;
  resourceId: string;
  customerName: string;
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  status: BookingStatus;
  holdExpiresAt: Date | null;
}

export interface RequestHoldInput {
  resourceId: string;
  customerName: string;
  startsAt: Date;
  endsAt: Date;
  partySize?: number;
  /** Minutes before an unconfirmed hold stops counting toward capacity. Default 15. */
  holdMinutes?: number;
}
