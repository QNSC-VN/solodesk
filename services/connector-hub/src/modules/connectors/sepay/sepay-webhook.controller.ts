import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotFoundException, PermissionDeniedException } from '@qnsc-vn/platform-http';
import { Public } from '../../../platform/auth/public.decorator';
import { SkipTenantContext } from '../../../platform/skip-tenant-context.decorator';
import { runWithTenant } from '../../../platform/tenant-context';
import { VaultService } from '../../vault/application/vault.service';
import { WebhookIntakeService } from '../../webhooks/application/webhook-intake.service';
import type { SepayCredentials } from './sepay.adapter';

/**
 * SePay POSTs a JSON body per bank transaction (`id`, `gateway`,
 * `transactionDate`, `accountNumber`, `content`, `transferType`,
 * `transferAmount`, `referenceCode`, ...) to a URL the tenant configures in
 * SePay's own dashboard, authenticated by an `Authorization: Apikey <value>`
 * header SePay sends on every delivery — a SEPARATE secret from the
 * `apiToken` used for the pull-side API (`sepay.adapter.ts`).
 *
 * Two-factor resolution before anything is trusted: (1) the `:token` path
 * segment resolves WHICH tenant this is (`vault.webhook_tokens`, no secret
 * material, see its schema file), (2) the `Authorization` header is then
 * checked against THAT tenant's vaulted `webhookSecret` — an attacker who
 * guesses/leaks a token still cannot forge deliveries without the secret.
 */
@ApiTags('webhooks')
@Controller('webhooks/sepay')
export class SepayWebhookController {
  constructor(
    private readonly vaultService: VaultService,
    private readonly webhookIntakeService: WebhookIntakeService,
  ) {}

  @Post(':token')
  @Public()
  @SkipTenantContext()
  @ApiOperation({ summary: "SePay inbound transaction webhook — tenant-specific URL, verified against that tenant's vaulted webhook secret" })
  async handle(
    @Param('token') token: string,
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: Record<string, unknown>,
  ): Promise<{ success: boolean; deduplicated: boolean }> {
    const resolved = await this.vaultService.resolveWebhookToken(token);
    if (!resolved || resolved.provider !== 'sepay') {
      throw new NotFoundException('WEBHOOK_TOKEN_NOT_FOUND', 'Unknown or wrong-provider webhook token.');
    }

    return runWithTenant(resolved.tenantId, async () => {
      const credentials = (await this.vaultService.getDecryptedPayload(resolved.tenantId, 'sepay')) as SepayCredentials | null;
      if (!credentials) {
        throw new NotFoundException('CREDENTIAL_NOT_FOUND', 'No SePay credentials configured for this tenant.');
      }

      if (authHeader !== `Apikey ${credentials.webhookSecret}`) {
        throw new PermissionDeniedException('SEPAY_WEBHOOK_AUTH_FAILED', 'Authorization header does not match this tenant\'s configured webhook secret.');
      }

      const rawDate = String(body['transactionDate'] ?? '');
      // "YYYY-MM-DD HH:mm:ss", Vietnam local time (UTC+7, no DST) — NOT UTC,
      // appending "Z" directly would silently misdate every event by 7 hours.
      const occurredAt = new Date(`${rawDate.replace(' ', 'T')}+07:00`);

      const { isNew } = await this.webhookIntakeService.recordEvent({
        tenantId: resolved.tenantId,
        provider: 'sepay',
        providerEventId: String(body['id']),
        eventType: 'payment.received',
        occurredAt,
        payload: body,
      });

      return { success: true, deduplicated: !isNew };
    });
  }
}
