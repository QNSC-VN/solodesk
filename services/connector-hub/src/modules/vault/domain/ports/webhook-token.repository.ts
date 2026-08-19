import type { ConnectorProvider } from '../vault.types';

export const WEBHOOK_TOKEN_REPOSITORY = Symbol('WEBHOOK_TOKEN_REPOSITORY');

export interface ResolvedWebhookToken {
  tenantId: string;
  provider: ConnectorProvider;
}

export interface IWebhookTokenRepository {
  /** Idempotent — calling this again for the same tenant+provider returns the SAME token, never mints a second one. */
  getOrCreate(tenantId: string, provider: ConnectorProvider): Promise<string>;
  /** No tenant context involved — this table has no RLS, see its schema file's header comment. */
  resolve(token: string): Promise<ResolvedWebhookToken | null>;
}
