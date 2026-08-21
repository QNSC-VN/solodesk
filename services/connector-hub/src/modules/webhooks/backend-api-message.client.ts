import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { connectorFetch } from '../../platform/resilience/connector-http';
import { callWithResilience } from '../../platform/resilience/connector-policy';

export interface ForwardMessageInput {
  tenantId: string;
  channel: 'zalo';
  customerName: string;
  content: string;
  sourceEventId: string;
  occurredAt: string;
}

const BACKEND_API_TARGET = 'backend-api';

/**
 * Calls backend-api's `POST /internal/messages/inbound` — same
 * INTERNAL_SERVICE_TOKEN shape as `BackendApiPaymentClient` (the SePay
 * forward path), same resilience treatment: an internal-service call can
 * fail transiently too. A deduplicated event still returns 2xx there
 * (`deduplicated: true`), so webhook redelivery never livelocks.
 */
@Injectable()
export class BackendApiMessageClient {
  private readonly baseUrl: string;
  private readonly internalServiceToken: string;

  constructor(config: ConfigService<Env>) {
    this.baseUrl = config.get('BACKEND_API_BASE_URL', { infer: true })!;
    this.internalServiceToken = config.get('INTERNAL_SERVICE_TOKEN', { infer: true })!;
  }

  async forwardMessage(input: ForwardMessageInput): Promise<void> {
    await callWithResilience(BACKEND_API_TARGET, async () => {
      await connectorFetch(`${this.baseUrl}/internal/messages/inbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service-Token': this.internalServiceToken,
        },
        body: JSON.stringify(input),
      });
    });
  }
}
