import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * One `fetch` call to Resend's API — no SDK dependency, same "plain fetch,
 * not a vendor SDK" discipline as connector-hub's provider adapters.
 * "Let key, I will input later" pattern: `RESEND_API_KEY` unset (local dev/
 * test) logs the email instead of throwing, so manual testing never needs a
 * real inbox — a real deployment sets the real key and this actually sends.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService<Env>) {}

  async send(input: SendEmailInput): Promise<void> {
    const apiKey = this.config.get('RESEND_API_KEY', { infer: true });
    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY not set — would have sent email to ${input.to}: [${input.subject}] ${input.html}`);
      return;
    }

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
