import type { CustomerSummary, CustomerOrderSummary, CustomerBookingSummary } from '../customer.types';

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');

export interface ICustomerRepository {
  listSummaries(tenantId: string): Promise<CustomerSummary[]>;
  getOrders(tenantId: string, name: string): Promise<CustomerOrderSummary[]>;
  getBookings(tenantId: string, name: string): Promise<CustomerBookingSummary[]>;
}
