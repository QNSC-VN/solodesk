import { Injectable } from '@nestjs/common';
import { eq, and, asc, sql, gt, gte, type SQL } from 'drizzle-orm';
import { db, type Db } from '../../../../db/client';
import { lots } from '../../../../db/schema/lots';
import { stockMovements, type StockMovementType } from '../../../../db/schema/stock-movements';
import { withTenantTransaction, withTenantTransactionOrReuse } from '../../../../platform/tenant-context';
import { subtractMoney } from '../../../../platform/money';
import type { ILotRepository } from '../../domain/ports/lot.repository';
import type { Lot, ReceiveLotInput, AvailableQuantity } from '../../domain/inventory.types';

function toDomain(row: typeof lots.$inferSelect): Lot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    skuId: row.skuId,
    lotCode: row.lotCode,
    quantityOnHand: row.quantityOnHand,
    quantityReserved: row.quantityReserved,
    sourceChannel: row.sourceChannel,
    expiresAt: row.expiresAt,
    receivedAt: row.receivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class LotDrizzleRepository implements ILotRepository {
  async findById(id: string, tenantId: string): Promise<Lot | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(lots).where(and(eq(lots.id, id), eq(lots.tenantId, tenantId))).limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async listAvailableBySku(skuId: string, tenantId: string): Promise<Lot[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(lots)
        .where(
          and(
            eq(lots.skuId, skuId),
            eq(lots.tenantId, tenantId),
            gt(sql`${lots.quantityOnHand} - ${lots.quantityReserved}`, 0),
          ),
        )
        .orderBy(asc(lots.receivedAt));
      return rows.map(toDomain);
    });
  }

  async getAvailableQuantity(skuId: string, tenantId: string): Promise<AvailableQuantity> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select({
          totalOnHand: sql<string>`COALESCE(SUM(${lots.quantityOnHand}), 0)`,
          totalReserved: sql<string>`COALESCE(SUM(${lots.quantityReserved}), 0)`,
        })
        .from(lots)
        .where(and(eq(lots.skuId, skuId), eq(lots.tenantId, tenantId)));
      const row = rows[0]!;
      const totalOnHand = row.totalOnHand;
      const totalReserved = row.totalReserved;
      return {
        skuId,
        totalOnHand,
        totalReserved,
        totalAvailable: subtractMoney(totalOnHand, totalReserved, 3),
      };
    });
  }

  async receive(tenantId: string, input: ReceiveLotInput, createdBy?: string, outerTx?: Db): Promise<Lot> {
    return withTenantTransactionOrReuse(db, tenantId, outerTx, async (tx) => {
      const rows = await tx
        .insert(lots)
        .values({
          tenantId,
          skuId: input.skuId,
          lotCode: input.lotCode,
          quantityOnHand: input.quantity,
          sourceChannel: input.sourceChannel ?? null,
          expiresAt: input.expiresAt ?? null,
        })
        .returning();
      const lot = rows[0]!;
      await tx.insert(stockMovements).values({
        tenantId,
        lotId: lot.id,
        movementType: 'receipt',
        quantity: input.quantity,
        createdBy: createdBy ?? null,
      });
      return toDomain(lot);
    });
  }

  async reserve(lotId: string, tenantId: string, qty: string, referenceId?: string, tx?: Db): Promise<Lot | null> {
    // Postgres NUMERIC is exact decimal — no epsilon needed, unlike a float comparison.
    return this.atomicUpdate(
      lotId,
      tenantId,
      { quantityReserved: sql`${lots.quantityReserved} + ${qty}::numeric` },
      gte(sql`(${lots.quantityOnHand} - ${lots.quantityReserved})`, sql`${qty}::numeric`),
      'reservation',
      qty,
      referenceId,
      tx,
    );
  }

  async release(lotId: string, tenantId: string, qty: string, referenceId?: string, tx?: Db): Promise<Lot | null> {
    return this.atomicUpdate(
      lotId,
      tenantId,
      { quantityReserved: sql`${lots.quantityReserved} - ${qty}::numeric` },
      gte(lots.quantityReserved, sql`${qty}::numeric`),
      'release',
      qty,
      referenceId,
      tx,
    );
  }

  async consumeReserved(lotId: string, tenantId: string, qty: string, referenceId?: string, tx?: Db): Promise<Lot | null> {
    return this.atomicUpdate(
      lotId,
      tenantId,
      {
        quantityOnHand: sql`${lots.quantityOnHand} - ${qty}::numeric`,
        quantityReserved: sql`${lots.quantityReserved} - ${qty}::numeric`,
      },
      gte(lots.quantityReserved, sql`${qty}::numeric`),
      'consumption',
      qty,
      referenceId,
      tx,
    );
  }

  async consumeDirect(lotId: string, tenantId: string, qty: string, referenceId?: string, tx?: Db): Promise<Lot | null> {
    return this.atomicUpdate(
      lotId,
      tenantId,
      { quantityOnHand: sql`${lots.quantityOnHand} - ${qty}::numeric` },
      gte(sql`(${lots.quantityOnHand} - ${lots.quantityReserved})`, sql`${qty}::numeric`),
      'consumption',
      qty,
      referenceId,
      tx,
    );
  }

  /**
   * The single atomic operation every mutating method above composes:
   * `UPDATE lots SET <patch> WHERE id = ? AND tenant_id = ? AND <guard>
   * RETURNING *`. Postgres's row lock on the matched row is what makes this
   * race-free — two concurrent callers targeting the same lot serialize here,
   * and the loser's guard re-evaluates against the winner's already-committed
   * change, so it correctly sees insufficient quantity instead of overselling.
   * `null` return = the guard failed (returns 0 rows), never an exception —
   * the caller (application layer) decides what a failed guard means.
   */
  private async atomicUpdate(
    lotId: string,
    tenantId: string,
    patch: Record<string, unknown>,
    guard: SQL,
    movementType: StockMovementType,
    qty: string,
    referenceId?: string,
    outerTx?: Db,
  ): Promise<Lot | null> {
    return withTenantTransactionOrReuse(db, tenantId, outerTx, async (tx) => {
      const rows = await tx
        .update(lots)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(lots.id, lotId), eq(lots.tenantId, tenantId), guard))
        .returning();
      if (!rows[0]) return null;

      await tx.insert(stockMovements).values({
        tenantId,
        lotId,
        movementType,
        quantity: movementType === 'release' ? `-${qty}` : qty,
        referenceType: referenceId ? 'order' : null,
        referenceId: referenceId ?? null,
      });
      return toDomain(rows[0]);
    });
  }
}
