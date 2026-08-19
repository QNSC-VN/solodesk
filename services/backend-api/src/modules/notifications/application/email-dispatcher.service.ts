import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import type { NotificationType } from '../../../db/schema/notifications';
import { ResendEmailProvider } from '../infrastructure/email-providers/resend-email.provider';
import { SesEmailProvider } from '../infrastructure/email-providers/ses-email.provider';
import { renderEmailTemplate, type EmailTemplateVars } from '../domain/templates/email-templates';

/**
 * Resolves the ACTIVE provider (`EMAIL_PROVIDER=resend|ses`, default
 * `resend`) and renders the named template. The ONE place the "not
 * configured → log instead of throw" fallback lives — not duplicated per
 * provider — so local dev/test never needs a real inbox or real AWS
 * credentials regardless of which provider is selected.
 */
@Injectable()
export class EmailDispatcher {
  private readonly logger = new Logger(EmailDispatcher.name);

  constructor(
    private readonly config: ConfigService<Env>,
    private readonly resendProvider: ResendEmailProvider,
    private readonly sesProvider: SesEmailProvider,
  ) {}

  private activeProvider() {
    return this.config.get('EMAIL_PROVIDER', { infer: true }) === 'ses' ? this.sesProvider : this.resendProvider;
  }

  async dispatch<K extends NotificationType>(to: string, templateName: K, vars: EmailTemplateVars[K]): Promise<void> {
    const { subject, html } = renderEmailTemplate(templateName, vars);
    const provider = this.activeProvider();

    if (!provider.isConfigured()) {
      this.logger.warn(`Email provider not configured — would have sent to ${to}: [${subject}] ${html}`);
      return;
    }

    await provider.send({ to, subject, html });
  }
}
