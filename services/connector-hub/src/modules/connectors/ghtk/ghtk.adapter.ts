import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import { connectorFetch } from '../../../platform/resilience/connector-http';
import { callWithResilience } from '../../../platform/resilience/connector-policy';
import type { IConnectorAdapter } from '../connector.interface';
import type { CredentialPayload } from '../../vault/domain/vault.types';

export interface GhtkCredentials extends CredentialPayload {
  /** GHTK "Token" — sent as the `Token` header on every request, same auth shape as GHN's. */
  token: string;
}

export interface CreateShippingOrderInput {
  orderId: string;
  pickName: string;
  pickAddress: string;
  pickProvince: string;
  pickDistrict: string;
  pickTel: string;
  toName: string;
  toAddress: string;
  toProvince: string;
  toDistrict: string;
  toWard: string;
  toTel: string;
  weightGrams: number;
  codAmount?: number;
  declaredValue?: number;
  note?: string;
}

export interface ShippingOrderResult {
  labelId: string;
  fee: number;
  insuranceFee: number;
  estimatedDeliverTime: string;
}

/**
 * GHTK (Giao Hàng Tiết Kiệm) — one of the docs' listed shipping connectors
 * (`shipping | GHN, GHTK, ViettelPost`), promoted from `stub-connectors.ts`
 * as the second real shipping connector following `ghn.adapter.ts`'s exact
 * shape (both use a simple `Token` header, both are JSON REST, not SOAP —
 * this is why a shipping provider was promoted before an e-invoice one:
 * MISA/Viettel/VNPT are typically SOAP/XML with digital-signature
 * requirements, meaningfully higher risk of confidently-wrong code without
 * live credentials to verify against, same reasoning CLAUDE.md already
 * recorded for the original 3-connector scope cut).
 *
 * NOT yet verified against a real GHTK account — field names match GHTK's
 * public API docs as accurately as I can from training knowledge; confirm
 * against GHTK's sandbox once real credentials are entered via `POST
 * /v1/vault/ghtk/credentials`.
 */
@Injectable()
export class GhtkAdapter implements IConnectorAdapter {
  readonly provider = 'ghtk' as const;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env>) {
    this.baseUrl = config.get('GHTK_API_BASE_URL', { infer: true })!;
  }

  async verifyCredentials(payload: CredentialPayload): Promise<boolean> {
    const credentials = payload as GhtkCredentials;
    try {
      await callWithResilience(this.provider, () => this.listPickupAddresses(credentials));
      return true;
    } catch {
      return false;
    }
  }

  async listPickupAddresses(credentials: GhtkCredentials): Promise<unknown[]> {
    return callWithResilience(this.provider, async () => {
      const res = await connectorFetch(`${this.baseUrl}/services/shipment/list_pick_add`, {
        headers: { Token: credentials.token },
      });
      const body = (await res.json()) as { data: unknown[] };
      return body.data;
    });
  }

  async createShippingOrder(credentials: GhtkCredentials, input: CreateShippingOrderInput): Promise<ShippingOrderResult> {
    return callWithResilience(this.provider, async () => {
      const res = await connectorFetch(`${this.baseUrl}/services/shipment/order`, {
        method: 'POST',
        headers: { Token: credentials.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: [{ name: 'Hang hoa', weight: input.weightGrams / 1000, quantity: 1 }],
          order: {
            id: input.orderId,
            pick_name: input.pickName,
            pick_address: input.pickAddress,
            pick_province: input.pickProvince,
            pick_district: input.pickDistrict,
            pick_tel: input.pickTel,
            name: input.toName,
            address: input.toAddress,
            province: input.toProvince,
            district: input.toDistrict,
            ward: input.toWard,
            tel: input.toTel,
            is_freeship: '1',
            pick_money: input.codAmount ?? 0,
            value: input.declaredValue ?? 0,
            note: input.note,
            transport: 'road',
            pick_option: 'cod',
            weight_option: 'gram',
          },
        }),
      });
      const body = (await res.json()) as {
        order: { label: string; fee: number; insurance_fee: number; estimated_deliver_time: string };
      };
      return {
        labelId: body.order.label,
        fee: body.order.fee,
        insuranceFee: body.order.insurance_fee,
        estimatedDeliverTime: body.order.estimated_deliver_time,
      };
    });
  }

  async trackOrder(credentials: GhtkCredentials, labelId: string): Promise<unknown> {
    return callWithResilience(this.provider, async () => {
      const res = await connectorFetch(`${this.baseUrl}/services/shipment/v2/${labelId}`, {
        headers: { Token: credentials.token },
      });
      const body = (await res.json()) as { order: unknown };
      return body.order;
    });
  }
}
