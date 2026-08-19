import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { connectorFetch, NonRetryableConnectorError } from '../../platform/resilience/connector-http';
import { callWithResilience } from '../../platform/resilience/connector-policy';

export interface ForwardPaymentInput {
  tenantId: string;
  invoiceNumber: string;
  method: 'cash' | 'bank_transfer' | 'qr' | 'marketplace_settlement';
  amount: string;
  referenceCode?: string;
}

const BACKEND_API_TARGET = 'backend-api';

/**
 * Calls backend-api's `POST /internal/payments/by-invoice-number` —
 * authenticated by the shared `INTERNAL_SERVICE_TOKEN` secret, NOT a
 * per-user JWT (there is no tenant session on this side either; the
 * webhook itself is the origin of trust, already verified by
 * `SepayWebhookController` before this is ever called). Same
 * timeout/retry-classification/circuit-breaker treatment as any other
 * outbound call this service makes — an internal-service call can fail
 * transiently too, same as a third-party one.
 */
@Injectable()
export class BackendApiPaymentClient {
  private readonly baseUrl: string;
  private readonly internalServiceToken: string;

  constructor(config: ConfigService<Env>) {
    this.baseUrl = config.get('BACKEND_API_BASE_URL', { infer: true })!;
    this.internalServiceToken = config.get('INTERNAL_SERVICE_TOKEN', { infer: true })!;
  }

  async forwardPayment(input: ForwardPaymentInput): Promise<void> {
    try {
      await callWithResilience(BACKEND_API_TARGET, async () => {
        await connectorFetch(`${this.baseUrl}/internal/payments/by-invoice-number`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Service-Token': this.internalServiceToken,
          },
          body: JSON.stringify(input),
        });
      });
    } catch (err) {
      // A 409 DUPLICATE_PAYMENT_REFERENCE from backend-api PROVES this exact
      // payment already landed on a previous attempt — this connector-hub
      // process just crashed/failed before it could call markForwarded.
      // Without this check, that narrow crash window would retry forever
      // (backend-api correctly rejects the duplicate every time, forever
      // preventing forwardedAt from ever being set) — a real livelock a
      // payment system cannot afford. Treated as success, not re-thrown.
      if (err instanceof NonRetryableConnectorError && err.message.includes('DUPLICATE_PAYMENT_REFERENCE')) {
        return;
      }
      throw err;
    }
  }
}
