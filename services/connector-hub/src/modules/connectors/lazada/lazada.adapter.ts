import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { Env } from '../../../config/env.schema';
import { connectorFetch } from '../../../platform/resilience/connector-http';
import { callWithResilience } from '../../../platform/resilience/connector-policy';
import type { IConnectorAdapter } from '../connector.interface';
import type { CredentialPayload } from '../../vault/domain/vault.types';

export interface LazadaCredentials extends CredentialPayload {
  appKey: string;
  appSecret: string;
  accessToken: string;
}

export interface LazadaOrder {
  orderId: string;
  orderStatus: string;
  createdAt: string;
}

/**
 * Lazada Open Platform API — the 3rd and last of docs' listed marketplace
 * connectors (`e-commerce marketplace | Shopee, TikTok Shop, Lazada`),
 * closing that category out. Same HMAC-signing family as
 * `shopee.adapter.ts`/`tiktok-shop.adapter.ts` (Lazada's Open Platform is
 * historically the same underlying tech lineage as Alibaba's TOP API,
 * which Shopee's own scheme was modeled after too) — proven shape a third
 * time, not a new risk category. Two differences from Shopee/TikTok Shop's
 * signing worth calling out: Lazada signs with UPPERCASE hex (not
 * lowercase) and includes `sign_method`/`timestamp` (milliseconds, not
 * seconds) as signed params. NOT yet verified against a live Lazada seller
 * account; field names and the signing algorithm match Lazada's public
 * Open Platform docs as accurately as I can from training knowledge —
 * confirm against Lazada's sandbox once real credentials are entered via
 * `POST /v1/vault/lazada/credentials`.
 */
@Injectable()
export class LazadaAdapter implements IConnectorAdapter {
  readonly provider = 'lazada' as const;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env>) {
    this.baseUrl = config.get('LAZADA_API_BASE_URL', { infer: true })!;
  }

  private sign(credentials: LazadaCredentials, path: string, params: Record<string, string>): string {
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys.map((k) => `${k}${params[k]}`).join('');
    const base = `${path}${paramString}`;
    return createHmac('sha256', credentials.appSecret).update(base).digest('hex').toUpperCase();
  }

  private signedUrl(credentials: LazadaCredentials, path: string, extraParams: Record<string, string> = {}): string {
    const timestamp = String(Date.now());
    const params: Record<string, string> = {
      app_key: credentials.appKey,
      access_token: credentials.accessToken,
      timestamp,
      sign_method: 'sha256',
      ...extraParams,
    };
    const sign = this.sign(credentials, path, params);
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('sign', sign);
    return url.toString();
  }

  async verifyCredentials(payload: CredentialPayload): Promise<boolean> {
    const credentials = payload as LazadaCredentials;
    try {
      await callWithResilience(this.provider, () => this.getSellerInfo(credentials));
      return true;
    } catch {
      return false;
    }
  }

  async getSellerInfo(credentials: LazadaCredentials): Promise<unknown> {
    return callWithResilience(this.provider, async () => {
      const res = await connectorFetch(this.signedUrl(credentials, '/seller/get'));
      return res.json();
    });
  }

  async getOrderList(credentials: LazadaCredentials, sinceUnixSeconds: number): Promise<LazadaOrder[]> {
    return callWithResilience(this.provider, async () => {
      const createdAfter = new Date(sinceUnixSeconds * 1000).toISOString();
      const res = await connectorFetch(
        this.signedUrl(credentials, '/orders/get', {
          created_after: createdAfter,
          limit: '50',
          offset: '0',
        }),
      );
      const body = (await res.json()) as { data: { orders: Array<{ order_id: number; statuses: string[]; created_at: string }> } };
      return body.data.orders.map((o) => ({ orderId: String(o.order_id), orderStatus: o.statuses[0] ?? 'unknown', createdAt: o.created_at }));
    });
  }
}
