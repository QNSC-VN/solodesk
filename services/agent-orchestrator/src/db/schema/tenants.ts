import { pgSchema, uuid, text } from 'drizzle-orm/pg-core';

/** READ-ONLY mirror of backend-api's `identity.tenants` — see `orders.ts`'s header comment. */
export const identitySchema = pgSchema('identity');

export const tenants = identitySchema.table('tenants', {
  id: uuid('id').primaryKey(),
  legalName: text('legal_name').notNull(),
});
