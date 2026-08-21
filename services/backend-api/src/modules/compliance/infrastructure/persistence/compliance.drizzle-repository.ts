import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db, type Db } from '../../../../db/client';
import { complianceDocuments } from '../../../../db/schema/compliance-documents';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { IComplianceRepository } from '../../domain/ports/compliance.repository';
import type { ComplianceDocument, CreateComplianceDocumentInput, UpdateComplianceDocumentInput } from '../../domain/compliance.types';

function toDomain(row: typeof complianceDocuments.$inferSelect): ComplianceDocument {
  return {
    id: row.id,
    tenantId: row.tenantId,
    docType: row.docType,
    documentNumber: row.documentNumber,
    issuedOn: row.issuedOn,
    expiresOn: row.expiresOn,
    isMandatory: row.isMandatory,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class ComplianceDrizzleRepository implements IComplianceRepository {
  async create(tenantId: string, input: CreateComplianceDocumentInput, tx: Db): Promise<ComplianceDocument> {
    const rows = await tx
      .insert(complianceDocuments)
      .values({
        tenantId,
        docType: input.docType,
        ...(input.documentNumber !== undefined ? { documentNumber: input.documentNumber } : {}),
        ...(input.issuedOn !== undefined ? { issuedOn: input.issuedOn } : {}),
        ...(input.expiresOn !== undefined ? { expiresOn: input.expiresOn } : {}),
        ...(input.isMandatory !== undefined ? { isMandatory: input.isMandatory } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      })
      .returning();
    return toDomain(rows[0]!);
  }

  async listByTenant(tenantId: string): Promise<ComplianceDocument[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(complianceDocuments).where(eq(complianceDocuments.tenantId, tenantId));
      return rows.map(toDomain);
    });
  }

  async findById(id: string, tenantId: string): Promise<ComplianceDocument | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(complianceDocuments)
        .where(and(eq(complianceDocuments.id, id), eq(complianceDocuments.tenantId, tenantId)))
        .limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async update(id: string, tenantId: string, input: UpdateComplianceDocumentInput): Promise<ComplianceDocument | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .update(complianceDocuments)
        .set({
          ...(input.docType !== undefined ? { docType: input.docType } : {}),
          ...(input.documentNumber !== undefined ? { documentNumber: input.documentNumber } : {}),
          ...(input.issuedOn !== undefined ? { issuedOn: input.issuedOn } : {}),
          ...(input.expiresOn !== undefined ? { expiresOn: input.expiresOn } : {}),
          ...(input.isMandatory !== undefined ? { isMandatory: input.isMandatory } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(complianceDocuments.id, id), eq(complianceDocuments.tenantId, tenantId)))
        .returning();
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async delete(id: string, tenantId: string): Promise<ComplianceDocument | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .delete(complianceDocuments)
        .where(and(eq(complianceDocuments.id, id), eq(complianceDocuments.tenantId, tenantId)))
        .returning();
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }
}
