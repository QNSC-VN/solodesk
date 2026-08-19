import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import { connectorFetch } from '../../../platform/resilience/connector-http';
import { callWithResilience } from '../../../platform/resilience/connector-policy';
import type { IConnectorAdapter } from '../connector.interface';
import type { CredentialPayload } from '../../vault/domain/vault.types';

export interface GhnCredentials extends CredentialPayload {
  /** GHN "Token" — sent as the `Token` header on every request. */
  token: string;
  /** GHN "Shop Id" — sent as the `ShopId` header, required for shop-scoped endpoints (create order, fee calc). Not needed for `/v2/shop/all`. */
  shopId: string;
}

export interface CreateShippingOrderInput {
  toName: string;
  toPhone: string;
  toAddress: string;
  toWardCode: string;
  toDistrictId: number;
  weightGrams: number;
  items: Array<{ name: string; quantity: number }>;
  codAmount?: number;
  note?: string;
}

export interface ShippingOrderResult {
  orderCode: string;
  totalFee: number;
  expectedDeliveryTime: string;
}

/**
 * GHN (Giao Hàng Nhanh) — one of the docs' listed shipping connectors
 * (`shipping | GHN, GHTK, ViettelPost`). NOT yet verified against a real
 * GHN account (no live credentials to test with) — field names below match
 * GHN's public API docs as accurately as I can from training knowledge,
 * but the exact required/optional fields and response shape should be
 * confirmed against GHN's sandbox once real credentials are entered via
 * `POST /v1/vault/ghn/credentials`.
 */
@Injectable()
export class GhnAdapter implements IConnectorAdapter {
  readonly provider = 'ghn' as const;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env>) {
    this.baseUrl = config.get('GHN_API_BASE_URL', { infer: true })!;
  }

  async verifyCredentials(payload: CredentialPayload): Promise<boolean> {
    const credentials = payload as GhnCredentials;
    try {
      await callWithResilience(this.provider, () => this.listShops(credentials));
      return true;
    } catch {
      return false;
    }
  }

  async listShops(credentials: GhnCredentials): Promise<unknown[]> {
    return callWithResilience(this.provider, async () => {
      const res = await connectorFetch(`${this.baseUrl}/v2/shop/all`, {
        method: 'POST',
        headers: { Token: credentials.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ offset: 0, limit: 50 }),
      });
      const body = (await res.json()) as { data: { shops: unknown[] } };
      return body.data.shops;
    });
  }

  async createShippingOrder(credentials: GhnCredentials, input: CreateShippingOrderInput): Promise<ShippingOrderResult> {
    return callWithResilience(this.provider, async () => {
      const res = await connectorFetch(`${this.baseUrl}/v2/shipping-order/create`, {
        method: 'POST',
        headers: { Token: credentials.token, ShopId: credentials.shopId, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_name: input.toName,
          to_phone: input.toPhone,
          to_address: input.toAddress,
          to_ward_code: input.toWardCode,
          to_district_id: input.toDistrictId,
          weight: input.weightGrams,
          cod_amount: input.codAmount ?? 0,
          required_note: 'KHONGCHOXEMHANG',
          note: input.note,
          items: input.items.map((i) => ({ name: i.name, quantity: i.quantity })),
        }),
      });
      const body = (await res.json()) as { data: { order_code: string; total_fee: number; expected_delivery_time: string } };
      return { orderCode: body.data.order_code, totalFee: body.data.total_fee, expectedDeliveryTime: body.data.expected_delivery_time };
    });
  }

  async trackOrder(credentials: GhnCredentials, orderCode: string): Promise<unknown> {
    return callWithResilience(this.provider, async () => {
      const res = await connectorFetch(`${this.baseUrl}/v2/shipping-order/detail`, {
        method: 'POST',
        headers: { Token: credentials.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_code: orderCode }),
      });
      const body = (await res.json()) as { data: unknown };
      return body.data;
    });
  }
}
