import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotFoundException } from '@qnsc-vn/platform-http';
import { Public } from '../../../platform/auth/public.decorator';
import { SkipTenantContext } from '../../../platform/skip-tenant-context.decorator';
import { runWithTenant } from '../../../platform/tenant-context';
import { VaultService } from '../../vault/application/vault.service';
import { WebhookIntakeService } from '../../webhooks/application/webhook-intake.service';
import { BackendApiMessageClient } from '../../webhooks/backend-api-message.client';

/**
 * Zalo OA pushes a customer's chat message as JSON to a URL the tenant
 * configures in their OA dashboard. The payload fields below
 * (`messageId`, `maNguoiDung`, `khach`, `luc`, `noiDung`) mirror the CEO
 * mockup's own simulated `khachHoi` event shape — the REAL Zalo OA webhook
 * contract is NOT yet verified against live documentation (the mockup
 * itself marks Zalo freshness "chưa đo — Q-034" and its own OA approval
 * "cho_duyet"), so this intake is honest about being shape-assumed until
 * a real OA account exercises it. The dedup + forward machinery around
 * the shape is real and identical to SePay's.
 *
 * Unlike SePay there is NO second auth factor: no vaulted webhook secret
 * exists because there is no OA account to obtain one from. The
 * unguessable `:token` path segment is the entire trust boundary — the
 * same deliberate design as `vault.webhook_tokens` itself (it holds no
 * secret material; knowing a token only reveals which tenant+provider it
 * maps to). When a real OA exists, add the secret-header check SePay has.
 */
@ApiTags('webhooks')
@Controller('webhooks/zalo')
export class ZaloWebhookController {
  constructor(
    private readonly vaultService: VaultService,
    private readonly webhookIntakeService: WebhookIntakeService,
    private readonly backendApiClient: BackendApiMessageClient,
  ) {}

  @Post(':token')
  @Public()
  @SkipTenantContext()
  @ApiOperation({ summary: "Zalo OA inbound customer-message webhook — tenant-specific URL; the token itself is the trust boundary until a real OA secret exists" })
  async handle(
    @Param('token') token: string,
    @Body() body: Record<string, unknown>,
  ): Promise<{ success: boolean; deduplicated: boolean; forwarded: boolean }> {
    const resolved = await this.vaultService.resolveWebhookToken(token);
    if (!resolved || resolved.provider !== 'zalo') {
      throw new NotFoundException('WEBHOOK_TOKEN_NOT_FOUND', 'Unknown or wrong-provider webhook token.');
    }

    return runWithTenant(resolved.tenantId, async () => {
      const messageId = String(body['messageId'] ?? body['maNguoiDung'] ?? '');
      if (!messageId) {
        throw new NotFoundException('MESSAGE_ID_MISSING', 'Payload carries no messageId/maNguoiDung to dedup on.');
      }
      const content = String(body['noiDung'] ?? '').trim();
      const customerName = String(body['khach'] ?? '').trim();
      if (!content || !customerName) {
        throw new NotFoundException('MESSAGE_FIELDS_MISSING', 'Payload carries no khach/noiDung — not a customer message.');
      }

      // "YYYY-MM-DDTHH:mm:ss", Vietnam local time (UTC+7, no DST) — same
      // misdate-by-7-hours trap SePay's transactionDate has.
      const rawDate = String(body['luc'] ?? '');
      const occurredAt = rawDate ? new Date(`${rawDate.includes('T') ? rawDate : rawDate.replace(' ', 'T')}+07:00`) : new Date();

      const { event, isNew } = await this.webhookIntakeService.recordEvent({
        tenantId: resolved.tenantId,
        provider: 'zalo',
        providerEventId: messageId,
        eventType: 'message.received',
        occurredAt,
        payload: body,
      });

      let forwarded = false;
      if (!event.forwardedAt) {
        // Deliberately NOT caught — a non-2xx here makes Zalo's own webhook
        // redelivery the retry mechanism (forwardedAt stays NULL until a
        // forward succeeds), exactly the SePay forward contract.
        await this.backendApiClient.forwardMessage({
          tenantId: resolved.tenantId,
          channel: 'zalo',
          customerName,
          content,
          sourceEventId: messageId,
          occurredAt: occurredAt.toISOString(),
        });
        await this.webhookIntakeService.markForwarded(event.id, resolved.tenantId);
        forwarded = true;
      }

      return { success: true, deduplicated: !isNew, forwarded };
    });
  }
}
