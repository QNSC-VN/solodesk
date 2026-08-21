import { pgSchema, uuid, text, boolean, date, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const complianceSchema = pgSchema('compliance');

/**
 * Compliance documents (mockup's "Hồ sơ để bán cho khách tổ chức"): one row
 * per artifact — ATTP certificate, sản phẩm tự công bố, đăng kiểm phương
 * tiện thuỷ, ... `docType` is free text (the mockup has no enum either; the
 * real set varies by industry). `documentNumber` NULL = known-required-but-
 * missing (the mockup's 'thieu' rows). Status is DERIVED at read time, never
 * stored — see `ComplianceDocumentStatus` in the domain types.
 */
export const complianceDocuments = complianceSchema.table('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  docType: text('doc_type').notNull(),
  documentNumber: text('document_number'),
  issuedOn: date('issued_on'),
  expiresOn: date('expires_on'),
  isMandatory: boolean('is_mandatory').notNull().default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
