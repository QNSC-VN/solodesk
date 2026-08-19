import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../../config/env.schema';
import type { IEmailProvider, SendEmailInput } from '../../domain/ports/email-provider.port';

/** One `fetch` call to Resend's API — no SDK dependency, same "plain fetch, not a vendor SDK" discipline as connector-hub's provider adapters. */
@Injectable()
export class ResendEmailProvider implements IEmailProvider {
  constructor(private readonly config: ConfigService<Env>) {}

  isConfigured(): boolean {
    return Boolean(this.config.get('RESEND_API_KEY', { infer: true }));
  }

  async send(input: SendEmailInput): Promise<void> {
    const apiKey = this.config.get('RESEND_API_KEY', { infer: true });
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.get('EMAIL_FROM_ADDRESS', { infer: true }),
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend send failed: ${response.status} ${body}`);
    }
  }
}
