import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { Env } from '../../../../config/env.schema';
import type { IEmailProvider, SendEmailInput } from '../../domain/ports/email-provider.port';

/**
 * Real AWS SES v2 send — not live-verified (no real AWS credentials in this
 * session), same disclaimer as every other not-live-verified 3rd-party
 * integration in this repo (connector-hub's adapters, Google OAuth). Real
 * rally has a working SES provider; this is the same real API shape,
 * confirm against a real SES-verified sending identity once credentials
 * are entered.
 */
@Injectable()
export class SesEmailProvider implements IEmailProvider {
  private client: SESv2Client | undefined;

  constructor(private readonly config: ConfigService<Env>) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get('AWS_REGION', { infer: true }) &&
        this.config.get('AWS_ACCESS_KEY_ID', { infer: true }) &&
        this.config.get('AWS_SECRET_ACCESS_KEY', { infer: true }),
    );
  }

  private getClient(): SESv2Client {
    if (!this.client) {
      this.client = new SESv2Client({
        region: this.config.get('AWS_REGION', { infer: true })!,
        credentials: {
          accessKeyId: this.config.get('AWS_ACCESS_KEY_ID', { infer: true })!,
          secretAccessKey: this.config.get('AWS_SECRET_ACCESS_KEY', { infer: true })!,
        },
      });
    }
    return this.client;
  }

  async send(input: SendEmailInput): Promise<void> {
    await this.getClient().send(
      new SendEmailCommand({
        FromEmailAddress: this.config.get('EMAIL_FROM_ADDRESS', { infer: true }),
        Destination: { ToAddresses: [input.to] },
        Content: {
          Simple: {
            Subject: { Data: input.subject, Charset: 'UTF-8' },
            Body: { Html: { Data: input.html, Charset: 'UTF-8' } },
          },
        },
      }),
    );
  }
}
