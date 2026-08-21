import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@qnsc-vn/platform-http';
import { assertTenantMatchesSession, withTenantTransaction } from '../../../platform/tenant-context';
import { withIdempotency } from '../../../platform/idempotency';
import { db } from '../../../db/client';
import type { Db } from '../../../db/client';
import { COMPLIANCE_REPOSITORY, type IComplianceRepository } from '../domain/ports/compliance.repository';
import type { ComplianceDocument, ComplianceDocumentView, CreateComplianceDocumentInput, UpdateComplianceDocumentInput } from '../domain/compliance.types';
import { deriveStatus, countIncomplete, daysUntil } from '../domain/compliance.types';

@Injectable()
export class ComplianceService {
  constructor(@Inject(COMPLIANCE_REPOSITORY) private readonly repository: IComplianceRepository) {}

  async listDocuments(tenantId: string): Promise<ComplianceDocumentView[]> {
    assertTenantMatchesSession(tenantId);
    const docs = await this.repository.listByTenant(tenantId);
    const asOf = new Date();
    const incompleteCount = countIncomplete(docs);
    return docs.map((doc) => ({
      ...doc,
      status: deriveStatus(doc, asOf),
      daysRemaining: doc.expiresOn ? daysUntil(asOf, doc.expiresOn) : null,
      incompleteCount,
    }));
  }

  async createDocument(tenantId: string, input: CreateComplianceDocumentInput, idempotencyKey: string): Promise<ComplianceDocumentView> {
    assertTenantMatchesSession(tenantId);
    const created = await withTenantTransaction(db, tenantId, (tx: Db) =>
      withIdempotency(tx, tenantId, idempotencyKey, () => this.repository.create(tenantId, input, tx)));
    return this.toView(created);
  }

  async updateDocument(id: string, tenantId: string, input: UpdateComplianceDocumentInput): Promise<ComplianceDocumentView> {
    assertTenantMatchesSession(tenantId);
    const updated = await this.repository.update(id, tenantId, input);
    if (!updated) throw new NotFoundException('COMPLIANCE_DOCUMENT_NOT_FOUND', 'Compliance document not found.');
    return this.toView(updated);
  }

  async deleteDocument(id: string, tenantId: string): Promise<void> {
    assertTenantMatchesSession(tenantId);
    const deleted = await this.repository.delete(id, tenantId);
    if (!deleted) throw new NotFoundException('COMPLIANCE_DOCUMENT_NOT_FOUND', 'Compliance document not found.');
  }

  private toView(doc: ComplianceDocument): ComplianceDocumentView {
    const asOf = new Date();
    return {
      ...doc,
      status: deriveStatus(doc, asOf),
      daysRemaining: doc.expiresOn ? daysUntil(asOf, doc.expiresOn) : null,
      incompleteCount: 0, // single-doc paths don't recompute the list count; list callers get the real one
    };
  }
}
