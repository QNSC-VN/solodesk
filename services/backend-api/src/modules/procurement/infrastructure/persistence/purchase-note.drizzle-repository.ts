import { Injectable } from '@nestjs/common';
import { eq, and, inArray } from 'drizzle-orm';
import { db, type Db } from '../../../../db/client';
import { purchaseNotes } from '../../../../db/schema/purchase-notes';
import { purchaseNoteLines } from '../../../../db/schema/purchase-note-lines';
import { suppliers } from '../../../../db/schema/suppliers';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import { sumMoney } from '../../../../platform/money';
import type { IPurchaseNoteRepository, ResolvedPurchaseNoteLine } from '../../domain/ports/purchase-note.repository';
import type { PurchaseNote, CreatePurchaseNoteInput } from '../../domain/procurement.types';

function toNote(note: typeof purchaseNotes.$inferSelect, lineRows: (typeof purchaseNoteLines.$inferSelect)[]): PurchaseNote {
  return {
    id: note.id,
    tenantId: note.tenantId,
    supplierId: note.supplierId,
    status: note.status,
    totalAmount: note.totalAmount,
    createdAt: note.createdAt,
    lines: lineRows.map((l) => ({ id: l.id, skuId: l.skuId, lotId: l.lotId, quantity: l.quantity, unitCost: l.unitCost, lineTotal: l.lineTotal })),
  };
}

async function loadNote(tx: Db, id: string, tenantId: string): Promise<PurchaseNote | null> {
  const noteRows = await tx.select().from(purchaseNotes).where(and(eq(purchaseNotes.id, id), eq(purchaseNotes.tenantId, tenantId))).limit(1);
  const note = noteRows[0];
  if (!note) return null;

  const lineRows = await tx
    .select()
    .from(purchaseNoteLines)
    .where(and(eq(purchaseNoteLines.purchaseNoteId, id), eq(purchaseNoteLines.tenantId, tenantId)));

  return toNote(note, lineRows);
}

@Injectable()
export class PurchaseNoteDrizzleRepository implements IPurchaseNoteRepository {
  async findById(id: string, tenantId: string): Promise<PurchaseNote | null> {
    return withTenantTransaction(db, tenantId, (tx) => loadNote(tx, id, tenantId));
  }

  async listByTenant(tenantId: string): Promise<PurchaseNote[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const noteRows = await tx.select().from(purchaseNotes).where(eq(purchaseNotes.tenantId, tenantId));
      if (noteRows.length === 0) return [];

      // Batched, not one loadNote() call per row — see order.drizzle-repository.ts's
      // listByTenant for the same fix and why (1 + 2N queries collapsed to 2).
      const noteIds = noteRows.map((n) => n.id);
      const lineRows = await tx
        .select()
        .from(purchaseNoteLines)
        .where(and(inArray(purchaseNoteLines.purchaseNoteId, noteIds), eq(purchaseNoteLines.tenantId, tenantId)));
      const linesByNoteId = new Map<string, (typeof purchaseNoteLines.$inferSelect)[]>();
      for (const l of lineRows) {
        const existing = linesByNoteId.get(l.purchaseNoteId);
        if (existing) existing.push(l);
        else linesByNoteId.set(l.purchaseNoteId, [l]);
      }
      return noteRows.map((n) => toNote(n, linesByNoteId.get(n.id) ?? []));
    });
  }

  async create(
    tenantId: string,
    input: Pick<CreatePurchaseNoteInput, 'supplierId'>,
    lines: ResolvedPurchaseNoteLine[],
    tx: Db,
  ): Promise<PurchaseNote> {
    const totalAmount = sumMoney(lines.map((l) => l.lineTotal));

    const noteRows = await tx.insert(purchaseNotes).values({ tenantId, supplierId: input.supplierId, totalAmount }).returning();
    const note = noteRows[0]!;

    await tx.insert(purchaseNoteLines).values(
      lines.map((l) => ({
        tenantId,
        purchaseNoteId: note.id,
        skuId: l.skuId,
        lotId: l.lotId,
        quantity: l.quantity,
        unitCost: l.unitCost,
        lineTotal: l.lineTotal,
      })),
    );

    const full = await loadNote(tx, note.id, tenantId);
    return full!;
  }

  async findSupplierNameByLotId(lotId: string, tenantId: string): Promise<string | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select({ name: suppliers.name })
        .from(purchaseNoteLines)
        .innerJoin(purchaseNotes, eq(purchaseNoteLines.purchaseNoteId, purchaseNotes.id))
        .innerJoin(suppliers, eq(purchaseNotes.supplierId, suppliers.id))
        .where(and(eq(purchaseNoteLines.lotId, lotId), eq(purchaseNoteLines.tenantId, tenantId)))
        .limit(1);
      return rows[0]?.name ?? null;
    });
  }
}
