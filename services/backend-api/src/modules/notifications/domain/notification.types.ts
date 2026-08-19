import type { NotificationType } from '../../../db/schema/notifications';
import type { EmailTemplateVars } from './templates/email-templates';

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

/**
 * `email` is optional — some notifications are in-app only. When present,
 * `templateName` must be the SAME `type` this notification is filed under
 * (enforced by `NotifyInput`'s generic below), so vars are checked against
 * the correct template at the call site.
 */
export type NotifyInput<T extends NotificationType = NotificationType> = {
  userId: string;
  type: T;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  sourceEventId?: string;
  email?: { templateName: T; vars: EmailTemplateVars[T] };
};
