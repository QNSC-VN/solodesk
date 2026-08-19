import { Inject, Injectable } from '@nestjs/common';
import { ConflictException, NotFoundException } from '@qnsc-vn/platform-http';
import { db } from '../../../db/client';
import { assertTenantMatchesSession, withTenantTransaction } from '../../../platform/tenant-context';
import { withIdempotency } from '../../../platform/idempotency';
import { multiplyMoney } from '../../../platform/money';
import { ORDER_REPOSITORY, type IOrderRepository, type ResolvedOrderLine } from '../domain/ports/order.repository';
import { LOT_REPOSITORY } from '../../catalog-inventory/domain/ports/lot.repository';
import type { ILotRepository } from '../../catalog-inventory/domain/ports/lot.repository';
import { SKU_REPOSITORY } from '../../catalog-inventory/domain/ports/sku.repository';
import type { ISkuRepository } from '../../catalog-inventory/domain/ports/sku.repository';
import type { Order, CreateOrderInput } from '../domain/order.types';

/**
 * `placeOrder` is the one operation in this codebase that most needs to be
 * a single transaction spanning two aggregates (Order, Lot) — an order
 * recorded with no stock deducted (or stock deducted with no order recorded)
 * is exactly the kind of silent inconsistency Mục 11 exists to prevent.
 * Composed from: `withTenantTransaction` (one tx) → `withIdempotency` (Mục
 * 5.2, inside that tx) → per-line `lotRepository.consumeDirect(..., tx)`
 * (Mục 11's race guard, same tx) → `orderRepository.create(..., tx)` (same
 * tx). Any failure anywhere rolls back everything, including the
 * idempotency-key insert — a failed attempt never blocks a legitimate retry.
 */
@Injectable()
export class OrderService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository,
    @Inject(LOT_REPOSITORY) private readonly lotRepository: ILotRepository,
    @Inject(SKU_REPOSITORY) private readonly skuRepository: ISkuRepository,
  ) {}

  async placeOrder(tenantId: string, idempotencyKey: string, input: CreateOrderInput): Promise<Order> {
    assertTenantMatchesSession(tenantId);

    return withTenantTransaction(db, tenantId, (tx) =>
      withIdempotency(tx, tenantId, idempotencyKey, async () => {
        const resolvedLines: ResolvedOrderLine[] = [];

        for (const line of input.lines) {
          const sku = await this.skuRepository.findById(line.skuId, tenantId);
          if (!sku) {
            throw new NotFoundException('SKU_NOT_FOUND', `SKU ${line.skuId} not found`);
          }

          let lotId = line.lotId;
          if (!lotId) {
            const [oldest] = await this.lotRepository.listAvailableBySku(line.skuId, tenantId);
            if (!oldest) {
              throw new ConflictException('NO_AVAILABLE_LOT', `No lot with available stock for SKU ${line.skuId}.`);
            }
            lotId = oldest.id;
          }

          // Snapshot NOW, at order time — never re-read at fulfillment. This
          // is the concrete fix for Mục 11's "giữ giá đơn treo".
          const unitPrice = line.unitPrice ?? sku.unitPrice;

          const consumed = await this.lotRepository.consumeDirect(lotId, tenantId, line.quantity, undefined, tx);
          if (!consumed) {
            throw new ConflictException('INSUFFICIENT_STOCK', `Lot ${lotId} does not have ${line.quantity} available.`);
          }

          const lineTotal = multiplyMoney(unitPrice, line.quantity);
          resolvedLines.push({ skuId: line.skuId, lotId, quantity: line.quantity, unitPrice, lineTotal });
        }

        return this.orderRepository.create(
          tenantId,
          { channel: input.channel, ...(input.customerName !== undefined ? { customerName: input.customerName } : {}) },
          resolvedLines,
          tx,
        );
      }),
    );
  }

  async getOrder(id: string, tenantId: string): Promise<Order> {
    assertTenantMatchesSession(tenantId);
    const order = await this.orderRepository.findById(id, tenantId);
    if (!order) {
      throw new NotFoundException('ORDER_NOT_FOUND', `Order ${id} not found`);
    }
    return order;
  }

  async listOrders(tenantId: string): Promise<Order[]> {
    assertTenantMatchesSession(tenantId);
    return this.orderRepository.listByTenant(tenantId);
  }
}
