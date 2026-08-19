import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { Env } from '../../../config/env.schema';
import { connectorFetch } from '../../../platform/resilience/connector-http';
import { callWithResilience } from '../../../platform/resilience/connector-policy';
import type { IConnectorAdapter } from '../connector.interface';
import type { CredentialPayload } from '../../vault/domain/vault.types';

export interface ShopeeCredentials extends CredentialPayload {
  partnerId: string;
  partnerKey: string;
  shopId: string;
  accessToken: string;
}

export interface ShopeeOrder {
  orderSn: string;
  orderStatus: string;
  createTime: number;
}

/**
 * Shopee Open Platform API v2 — one of docs' listed marketplace connectors
 * (`e-commerce marketplace | Shopee, TikTok Shop, Lazada`). NOT yet verified
 * against a live Shopee partner account. The signing scheme below (HMAC-
 * SHA256 over `partner_id + api_path + timestamp + access_token + shop_id`,
 * hex-encoded, as the `sign` query param alongside `partner_id`/`timestamp`/
 * `access_token`/`shop_id`) matches Shopee's v2 auth docs as accurately as I
 * can from training knowledge — confirm against Shopee's sandbox once real
 * partner credentials are entered via `POST /v1/vault/shopee/credentials`.
 * `accessToken` also expires and needs Shopee's refresh-token flow, which
 * is NOT implemented here (YAGNI until this adapter is actually exercised
 * against a live shop) — `verifyCredentials` will simply start failing once
 * it expires, which is the honest, visible failure mode until that's built.
 */
@Injectable()
export class ShopeeAdapter implements IConnectorAdapter {
  readonly provider = 'shopee' as const;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env>) {
    this.baseUrl = config.get('SHOPEE_API_BASE_URL', { infer: true })!;
  }

  private sign(credentials: ShopeeCredentials, apiPath: string, timestamp: number): string {
    const baseString = `${credentials.partnerId}${apiPath}${timestamp}${credentials.accessToken}${credentials.shopId}`;
    return createHmac('sha256', credentials.partnerKey).update(baseString).digest('hex');
  }

  private signedUrl(credentials: ShopeeCredentials, apiPath: string, extraParams: Record<string, string> = {}): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.sign(credentials, apiPath, timestamp);
    const url = new URL(`${this.baseUrl}${apiPath}`);
    url.searchParams.set('partner_id', credentials.partnerId);
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('sign', sign);
    url.searchParams.set('shop_id', credentials.shopId);
    url.searchParams.set('access_token', credentials.accessToken);
    for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
    return url.toString();
  }

  async verifyCredentials(payload: CredentialPayload): Promise<boolean> {
    const credentials = payload as ShopeeCredentials;
    try {
      await callWithResilience(this.provider, () => this.getShopInfo(credentials));
      return true;
    } catch {
      return false;
    }
  }

  async getShopInfo(credentials: ShopeeCredentials): Promise<unknown> {
    return callWithResilience(this.provider, async () => {
      const res = await connectorFetch(this.signedUrl(credentials, '/api/v2/shop/get_shop_info'));
      return res.json();
    });
  }

  async getOrderList(credentials: ShopeeCredentials, sinceUnixSeconds: number): Promise<ShopeeOrder[]> {
    return callWithResilience(this.provider, async () => {
      const res = await connectorFetch(
        this.signedUrl(credentials, '/api/v2/order/get_order_list', {
          time_range_field: 'create_time',
          time_from: String(sinceUnixSeconds),
          time_to: String(Math.floor(Date.now() / 1000)),
          page_size: '50',
        }),
      );
      const body = (await res.json()) as { response: { order_list: Array<{ order_sn: string; order_status: string; create_time: number }> } };
      return body.response.order_list.map((o) => ({ orderSn: o.order_sn, orderStatus: o.order_status, createTime: o.create_time }));
    });
  }
}
