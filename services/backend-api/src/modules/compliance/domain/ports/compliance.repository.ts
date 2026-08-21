import type { Db } from '../../../../db/client';
import type { ComplianceDocument, CreateComplianceDocumentInput, UpdateComplianceDocumentInput } from '../compliance.types';

export const COMPLIANCE_REPOSITORY = Symbol('COMPLIANCE_REPOSITORY');

export interface IComplianceRepository {
  create(tenantId: string, input: CreateComplianceDocumentInput, tx: Db): Promise<ComplianceDocument>;
  listByTenant(tenantId: string): Promise<ComplianceDocument[]>;
  findById(id: string, tenantId: string): Promise<ComplianceDocument | null>;
  update(id: string, tenantId: string, input: UpdateComplianceDocumentInput): Promise<ComplianceDocument | null>;
  /** `null` = not found. */
  delete(id: string, tenantId: string): Promise<ComplianceDocument | null>;
}
