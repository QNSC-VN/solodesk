import { pgSchema, uuid, text, jsonb, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

/** Dedicated schema, same "own schema" convention as `identity`/`platform`. */
export const notificationsSchema = pgSchema('notifications');

export type NotificationType = 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'EINVOICE_THRESHOLD_CROSSED' | 'FILING_DEADLINE_APPROACHING';

/**
 * RLS-scoped like every other business-data table (unlike real-login's
 * global identity tables) — a notification belongs to one tenant.
 */
export const notifications = notificationsSchema.table(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type').$type<NotificationType>().notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    metadata: jsonb('metadata'),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    sourceEventId: text('source_event_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantSourceEvent: unique().on(t.tenantId, t.sourceEventId),
  }),
);
