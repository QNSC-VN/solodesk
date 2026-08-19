import { uuid, text, jsonb, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { notificationsSchema, type NotificationType } from './notifications';

export type EmailOutboxStatus = 'pending' | 'sent' | 'failed' | 'dead_letter';

/**
 * The transactional-outbox half of the notification system — inserted in
 * the SAME transaction as the triggering domain event (never a separate,
 * swallow-on-failure step; see CLAUDE.md's "Notifications" section on the
 * rally bug this avoids), dispatched later by `EmailOutboxRelayService`.
 */
export const emailOutbox = notificationsSchema.table(
  'email_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    templateName: text('template_name').$type<NotificationType>().notNull(),
    templateVars: jsonb('template_vars').notNull(),
    status: text('status').$type<EmailOutboxStatus>().notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    sourceEventId: text('source_event_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => ({
    tenantSourceEvent: unique().on(t.tenantId, t.sourceEventId),
  }),
);
