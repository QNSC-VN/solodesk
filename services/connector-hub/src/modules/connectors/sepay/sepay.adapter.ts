import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import { connectorFetch } from '../../../platform/resilience/connector-http';
import { callWithResilience } from '../../../platform/resilience/connector-policy';
import type { IConnectorAdapter } from '../connector.interface';
import type { CredentialPayload } from '../../vault/domain/vault.types';

export interface SepayCredentials extends CredentialPayload {
  /** SePay "API Token" — Bearer auth for the read API (list bank accounts / transactions). Generated in SePay's dashboard. */
  apiToken: string;
  /** The value configured as SePay's webhook "Authorization: Apikey <value>" header — a SEPARATE secret from `apiToken`, verified by `SepayWebhookController` against every inbound delivery. */
  webhookSecret: string;
}

export interface SepayTransaction {
  id: string;
  gateway: string;
  transactionDate: string;
  accountNumber: string;
  content: string;
  transferType: 'in' | 'out';
  transferAmount: string;
  referenceCode: string | null;
}

/**
 * SePay VietQR (docs: "QR/bank reconciliation | SePay (NAPAS-authorized
 * partner) | Real-time webhooks + reconciliation"). Two distinct API
 * surfaces: this class covers the pull side (`GET /transactions/list`,
 * `GET /bankaccounts/list`) via `apiToken`; the push side (inbound webhook,
 * verified against `webhookSecret`) is `sepay-webhook.controller.ts`, kept
 * separate since it's a public route with an entirely different auth shape.
 *
 * NOT YET WIRED to `payment-reconcile` in `backend-api` — that's a real,
 * separately-scoped next step (an authenticated service-to-service HTTP
 * call, or SNS/SQS once docs Section 6's event infra exists), not done here.
 * This adapter's job stops at "verified, deduped, normalized event stored
 * in `sync.webhook_events`" — see CLAUDE.md.
 */
@Injectable()
export class SepayAdapter implements IConnectorAdapter {
  readonly provider = 'sepay' as const;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env>) {
    this.baseUrl = config.get('SEPAY_API_BASE_URL', { infer: true })!;
  }

  async verifyCredentials(payload: CredentialPayload): Promise<boolean> {
    const credentials = payload as SepayCredentials;
    try {
      await callWithResilience(this.provider, () => this.listBankAccounts(credentials));
      return true;
    } catch {
      return false;
    }
  }

  async listBankAccounts(credentials: SepayCredentials): Promise<unknown[]> {
    return callWithResilience(this.provider, async () => {
      const res = await connectorFetch(`${this.baseUrl}/bankaccounts/list`, {
        headers: { Authorization: `Bearer ${credentials.apiToken}` },
      });
      const body = (await res.json()) as { bankaccounts: unknown[] };
      return body.bankaccounts;
    });
  }

  async listTransactions(credentials: SepayCredentials, sinceId?: string): Promise<SepayTransaction[]> {
    return callWithResilience(this.provider, async () => {
      const url = new URL(`${this.baseUrl}/transactions/list`);
      if (sinceId) url.searchParams.set('since_id', sinceId);

      const res = await connectorFetch(url.toString(), {
        headers: { Authorization: `Bearer ${credentials.apiToken}` },
      });
      const body = (await res.json()) as { transactions: SepayTransaction[] };
      return body.transactions;
    });
  }
}
