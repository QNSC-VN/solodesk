import { describe, it, expect } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { runWithTenant } from '../src/platform/tenant-context';
import { WebhookTokenDrizzleRepository } from '../src/modules/vault/infrastructure/persistence/webhook-token.drizzle-repository';
import { WebhookEventDrizzleRepository } from '../src/modules/webhooks/infrastructure/persistence/webhook-event.drizzle-repository';
import { WebhookIntakeService } from '../src/modules/webhooks/application/webhook-intake.service';
import { ZaloWebhookController } from '../src/modules/connectors/zalo/zalo-webhook.controller';
import { BackendApiMessageClient } from '../src/modules/webhooks/backend-api-message.client';
import { NotFoundException } from '@qnsc-vn/platform-http';

/**
 * Real Postgres, no mocks — covers the Zalo inbound webhook's real intake
 * behavior: token resolution (wrong provider rejected, right provider
 * accepted), the recordEvent dedup on (provider, providerEventId), and the
 * forward/forwardedAt contract. The backend-api forward client is a fake
 * that records calls — the REAL backend-api side of the forward is covered
 * by backend-api's own `messaging.e2e-spec.ts` against its own real
 * Postgres; testing the HTTP hop twice through two databases would be a
 * full-stack integration test, not this service's unit of behavior.
 */

const tokenRepo = new WebhookTokenDrizzleRepository();
const eventRepo = new WebhookEventDrizzleRepository();
const intakeService = new WebhookIntakeService(eventRepo);

class FakeMessageClient {
  calls: Array<{ tenantId: string; sourceEventId: string }> = [];
  async forwardMessage(input: { tenantId: string; sourceEventId: string }): Promise<void> {
    this.calls.push({ tenantId: input.tenantId, sourceEventId: input.sourceEventId });
  }
}

function makeController(fake: FakeMessageClient) {
  const vaultResolve = async (token: string) => tokenRepo.resolve(token);
  const controller = new ZaloWebhookController(
    { resolveWebhookToken: vaultResolve } as never,
    intakeService,
    fake as unknown as BackendApiMessageClient,
  );
  return controller;
}

describe('Zalo inbound webhook — real Postgres, no mocks', () => {
  it('rejects a token that belongs to a different provider', async () => {
    const tenantId = uuidv7();
    const token = await runWithTenant(tenantId, () => tokenRepo.getOrCreate(tenantId, 'sepay'));
    await expect(
      makeController(new FakeMessageClient()).handle(token, {
        messageId: 'z-msg-1',
        khach: 'Chi Ngoc',
        noiDung: 'Con hang khong em',
        luc: '2026-08-21T22:14:00',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('ingests a customer message, forwards it once, and dedups a redelivery', async () => {
    const tenantId = uuidv7();
    const token = await runWithTenant(tenantId, () => tokenRepo.getOrCreate(tenantId, 'zalo'));
    const fake = new FakeMessageClient();
    const controller = makeController(fake);

    const payload = {
      messageId: `z-msg-2-${Date.now()}`,
      khach: 'Anh Bay',
      maNguoiDung: 'zoa_88213',
      noiDung: 'Mai ben minh con cho di cano khong em',
      luc: '2026-08-21T22:14:00',
    };

    const first = await controller.handle(token, payload);
    expect(first).toEqual({ success: true, deduplicated: false, forwarded: true });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.tenantId).toBe(tenantId);

    // Redelivery of the SAME messageId: deduped at intake, NOT forwarded again.
    const second = await controller.handle(token, payload);
    expect(second).toEqual({ success: true, deduplicated: true, forwarded: false });
    expect(fake.calls).toHaveLength(1);
  });

  it('rejects a payload with no dedup key and no message content', async () => {
    const tenantId = uuidv7();
    const token = await runWithTenant(tenantId, () => tokenRepo.getOrCreate(tenantId, 'zalo'));
    const controller = makeController(new FakeMessageClient());

    await expect(controller.handle(token, { khach: 'Ai do' })).rejects.toThrow(NotFoundException);
    await expect(controller.handle(token, { messageId: 'z-msg-3', khach: 'Ai do', noiDung: '   ' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
