import { pgSchema, uuid, text, timestamp, vector } from 'drizzle-orm/pg-core';

/**
 * NOT a read-only mirror of a backend-api table like the other schema
 * files here — this schema and table are OWNED by agent-orchestrator
 * (0005_add_knowledge_base.sql creates it), not backend-api. Shared
 * reference content, not tenant-scoped: no RLS, same shape as
 * backend-api's tax.tax_rules. See that migration's header comment.
 */
export const knowledgeSchema = pgSchema('knowledge');

export const knowledgeChunks = knowledgeSchema.table('chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  source: text('source').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
