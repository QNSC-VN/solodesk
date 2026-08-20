export const REVENUE_REPOSITORY = Symbol('REVENUE_REPOSITORY');

export interface IRevenueRepository {
  /** Sum of `sales.orders.total_amount` for real completed revenue (`status = 'confirmed'`) in `[from, to)`. Excludes `cancelled` AND `returned` — a returned order never became real revenue. */
  sumConfirmedRevenue(tenantId: string, from: Date, to: Date): Promise<string>;
}
