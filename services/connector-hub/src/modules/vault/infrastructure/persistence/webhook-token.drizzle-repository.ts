import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { webhookTokens } from '../../../../db/schema/webhook-tokens';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { IWebhookTokenRepository, ResolvedWebhookToken } from '../../domain/ports/webhook-token.repository';
import type { ConnectorProvider } from '../../domain/vault.types';

@Injectable()
export class WebhookTokenDrizzleRepository implements IWebhookTokenRepository {
  async getOrCreate(tenantId: string, provider: ConnectorProvider): Promise<string> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .insert(webhookTokens)
        .values({ tenantId, provider })
        .onConflictDoNothing({ target: [webhookTokens.tenantId, webhookTokens.provider] })
        .returning();
      if (rows[0]) return rows[0].token;

      const existing = await tx
        .select()
        .from(webhookTokens)
        .where(and(eq(webhookTokens.tenantId, tenantId), eq(webhookTokens.provider, provider)))
        .limit(1);
      return existing[0]!.token;
    });
  }

  /** Deliberately plain `db` — no `withTenantTransaction`, no tenant context to set. Same shape as `LotTraceDrizzleRepository.findByLotId`. */
  async resolve(token: string): Promise<ResolvedWebhookToken | null> {
    const rows = await db.select().from(webhookTokens).where(eq(webhookTokens.token, token)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return { tenantId: row.tenantId, provider: row.provider as ConnectorProvider };
  }
}
