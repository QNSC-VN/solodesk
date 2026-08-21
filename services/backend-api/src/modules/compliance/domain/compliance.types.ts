import { daysUntil } from '../../../platform/vn-time';

export interface ComplianceDocument {
  id: string;
  tenantId: string;
  docType: string;
  documentNumber: string | null;
  issuedOn: string | null; // date (YYYY-MM-DD), no time component
  expiresOn: string | null;
  isMandatory: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateComplianceDocumentInput {
  docType: string;
  documentNumber?: string;
  issuedOn?: string;
  expiresOn?: string;
  isMandatory?: boolean;
  notes?: string;
}

export interface UpdateComplianceDocumentInput {
  docType?: string;
  documentNumber?: string | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
  isMandatory?: boolean;
  notes?: string | null;
}

/**
 * DERIVED at read time, never stored (the mockup's trangThai is computed
 * the same way): a row with no document number is "missing" regardless of
 * dates; otherwise expired / expiring (mockup's 90-day window) / valid.
 * Docs with no expiry date tracked are simply "valid" (the mockup's
 * expires:null rows never enter its 90-day logic either).
 */
export type ComplianceDocumentStatus = 'missing' | 'expired' | 'expiring' | 'valid';

export const EXPIRY_WARN_DAYS = 90;

export function deriveStatus(doc: Pick<ComplianceDocument, 'documentNumber' | 'expiresOn'>, asOf: Date): ComplianceDocumentStatus {
  if (!doc.documentNumber) return 'missing';
  if (!doc.expiresOn) return 'valid';
  const days = daysUntil(asOf, doc.expiresOn);
  if (days < 0) return 'expired';
  if (days <= EXPIRY_WARN_DAYS) return 'expiring';
  return 'valid';
}

/** The one number the mockup's card header shows: "N mục chưa đủ". */
export function countIncomplete(docs: Array<Pick<ComplianceDocument, 'documentNumber' | 'expiresOn'>>): number {
  const asOf = new Date();
  return docs.filter((d) => {
    const status = deriveStatus(d, asOf);
    return status === 'missing' || status === 'expired';
  }).length;
}

export interface ComplianceDocumentView extends ComplianceDocument {
  status: ComplianceDocumentStatus;
  daysRemaining: number | null;
  incompleteCount: number;
}
