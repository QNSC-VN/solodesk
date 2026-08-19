import { pgSchema, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { lots } from './lots';

export const traceabilitySchema = pgSchema('traceability');

/**
 * Deliberately NOT tenant-scoped by RLS — the ONE table in this schema
 * designed for a genuinely public, unauthenticated read (`GET
 * /v1/trace/:lotId`, a buyer scanning a QR code). `tenantId` is kept as a
 * column for the authenticated PUBLISH path's ownership check
 * (`TraceabilityService.publishLotTrace` verifies the caller's tenant owns
 * the lot before writing here) — it is never used to gate the public read,
 * because the public read has no tenant context to gate with (see
 * `trace.controller.ts`'s `@SkipTenantContext()` route).
 *
 * A row exists here ONLY if a tenant explicitly published it — receiving a
 * lot into stock does NOT automatically create one. Deliberately a
 * denormalized snapshot at publish time (sku name/category, supplier name,
 * lot code), never a live join to `catalog.*`/`procurement.*` — those
 * tables are RLS-protected and this endpoint must never touch them.
 */
export const lotTraces = traceabilitySchema.table('lot_traces', {
  lotId: uuid('lot_id').primaryKey().references(() => lots.id),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  skuName: text('sku_name').notNull(),
  skuCategory: text('sku_category'),
  lotCode: text('lot_code').notNull(),
  sourceChannel: text('source_channel'),
  supplierName: text('supplier_name'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
});
