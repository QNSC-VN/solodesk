import { Inject, Injectable } from '@nestjs/common';
import { assertTenantMatchesSession } from '../../../platform/tenant-context';
import { compareMoney } from '../../../platform/money';
import { CUSTOMER_REPOSITORY, type ICustomerRepository } from '../domain/ports/customer.repository';
import type { CustomerSummary, CustomerDetail } from '../domain/customer.types';

@Injectable()
export class CustomerService {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customerRepository: ICustomerRepository) {}

  async listCustomers(tenantId: string): Promise<CustomerSummary[]> {
    assertTenantMatchesSession(tenantId);
    const summaries = await this.customerRepository.listSummaries(tenantId);
    // Highest spender first — the one sort order the mockup's own
    // customers() screen uses (descending tổng mua).
    return summaries.sort((a, b) => compareMoney(b.totalSpent, a.totalSpent));
  }

  /**
   * `name` is matched by exact string equality — the SAME real limitation
   * the mockup's own `customerDetail()` has (no id, no fuzzy match). A
   * name with zero matching orders/bookings still returns a valid (empty)
   * detail rather than a 404 — "no history yet" is a legitimate real
   * state for a name that only appears once, not an error.
   */
  async getCustomerDetail(tenantId: string, name: string): Promise<CustomerDetail> {
    assertTenantMatchesSession(tenantId);
    const [summaries, orders, bookings] = await Promise.all([
      this.customerRepository.listSummaries(tenantId),
      this.customerRepository.getOrders(tenantId, name),
      this.customerRepository.getBookings(tenantId, name),
    ]);
    const summary = summaries.find((s) => s.name === name) ?? {
      name,
      orderCount: 0,
      totalSpent: '0.00',
      firstOrderAt: null,
      lastOrderAt: null,
      primaryChannel: null,
      bookingCount: 0,
    };
    return { ...summary, orders, bookings };
  }
}
