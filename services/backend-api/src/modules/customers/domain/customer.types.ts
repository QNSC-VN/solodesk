/**
 * The CEO mockup's own "Khách hàng" screen has NO stored customer entity —
 * confirmed by reading its real implementation (`sm-domain.js`'s
 * `customers()`/`customerDetail()`): it's a derived aggregate, grouped by
 * an exact-match name string over orders/bookings, computed fresh every
 * render. v1 ports that SAME shape as a real backend aggregation — no new
 * table, no migration, no `customer_id` threaded through order creation.
 * The real limitation this carries over honestly: two orders with
 * slightly different spellings of the same person's name appear as two
 * separate customers — the mockup has this exact limitation too; fuzzy
 * matching/merging is a real, separate, deliberately deferred concern.
 */
export interface CustomerSummary {
  name: string;
  orderCount: number;
  totalSpent: string;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  primaryChannel: string | null;
  bookingCount: number;
}

export interface CustomerOrderSummary {
  id: string;
  channel: string;
  status: string;
  totalAmount: string;
  createdAt: Date;
}

export interface CustomerBookingSummary {
  id: string;
  resourceId: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  partySize: number;
}

export interface CustomerDetail extends CustomerSummary {
  orders: CustomerOrderSummary[];
  bookings: CustomerBookingSummary[];
}
