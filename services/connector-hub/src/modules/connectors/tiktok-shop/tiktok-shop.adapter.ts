import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { Env } from '../../../config/env.schema';
import { connectorFetch } from '../../../platform/resilience/connector-http';
import { callWithResilience } from '../../../platform/resilience/connector-policy';
import type { IConnectorAdapter } from '../connector.interface';
import type { CredentialPayload } from '../../vault/domain/vault.types';

export interface TiktokShopCredentials extends CredentialPayload {
  appKey: string;
  appSecret: string;
  accessToken: string;
  shopCipher: string;
}

export interface TiktokShopOrder {
  orderId: string;
  orderStatus: string;
  createTime: number;
}

/**
 * TikTok Shop Partner Center API v2 — one of docs' listed marketplace
 * connectors (`e-commerce marketplace | Shopee, TikTok Shop, Lazada`).
 * Promoted from `stub-connectors.ts` as the 5th real connector, chosen over
 * Booking.com (the option this repo's CLAUDE.md first named): Booking.com's
 * real Connectivity API requires OAuth2 partner certification, not a
 * simple key/token or HMAC-signed REST call — the same "confidently-wrong
 * code without a way to verify it" risk the e-invoice providers were passed
 * over for. TikTok Shop's signing scheme is HMAC-SHA256 wrapped with the
 * app secret on both ends of the string, the same family of scheme as
 * `shopee.adapter.ts`'s already-working HMAC pattern — proven shape, not a
 * new risk category. Both methods below are GET (path + sorted query
 * params only) — a POST call's JSON-body signing isn't wired in yet
 * (YAGNI until a real POST endpoint, e.g. order creation, is added). NOT
 * yet verified against a live TikTok Shop partner account; field names and
 * the signing algorithm match TikTok's public Partner Center docs as
 * accurately as I can from training knowledge — confirm against TikTok's
 * sandbox once real credentials are entered via `POST
 * /v1/vault/tiktok_shop/credentials`.
 */
@Injectable()
export class TiktokShopAdapter implements IConnectorAdapter {
  readonly provider = 'tiktok_shop' as const;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env>) {
    this.baseUrl = config.get('TIKTOK_SHOP_API_BASE_URL', { infer: true })!;
  }

  private sign(credentials: TiktokShopCredentials, path: string, params: Record<string, string>): string {
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys.map((k) => `${k}${params[k]}`).join('');
    const base = `${path}${paramString}`;
    const wrapped = `${credentials.appSecret}${base}${credentials.appSecret}`;
    return createHmac('sha256', credentials.appSecret).update(wrapped).digest('hex');
  }

  private signedUrl(credentials: TiktokShopCredentials, path: string, extraParams: Record<string, string> = {}): string {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const params: Record<string, string> = {
      app_key: credentials.appKey,
      access_token: credentials.accessToken,
      shop_cipher: credentials.shopCipher,
      timestamp,
      ...extraParams,
    };
    const sign = this.sign(credentials, path, params);
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('sign', sign);
    return url.toString();
  }

  async verifyCredentials(payload: CredentialPayload): Promise<boolean> {
    const credentials = payload as TiktokShopCredentials;
    try {
      await callWithResilience(this.provider, () => this.getShopInfo(credentials));
      return true;
    } catch {
      return false;
    }
  }

  async getShopInfo(credentials: TiktokShopCredentials): Promise<unknown> {
    return callWithResilience(this.provider, async () => {
      const res = await connectorFetch(this.signedUrl(credentials, '/authorization/202309/shops'));
      return res.json();
    });
  }

  async getOrderList(credentials: TiktokShopCredentials, sinceUnixSeconds: number): Promise<TiktokShopOrder[]> {
    return callWithResilience(this.provider, async () => {
      const res = await connectorFetch(
        this.signedUrl(credentials, '/order/202309/orders/search', {
          page_size: '50',
          create_time_ge: String(sinceUnixSeconds),
          create_time_lt: String(Math.floor(Date.now() / 1000)),
        }),
      );
      const body = (await res.json()) as { data: { orders: Array<{ id: string; status: string; create_time: number }> } };
      return body.data.orders.map((o) => ({ orderId: o.id, orderStatus: o.status, createTime: o.create_time }));
    });
  }
}
