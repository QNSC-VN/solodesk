import type { ConnectorProvider, CredentialPayload } from '../vault/domain/vault.types';

/**
 * Deliberately minimal — the docs' "Adapter" pattern (Section 20.5) is "one
 * per external channel," not "one universal interface every channel must
 * awkwardly conform to." A marketplace connector (order sync), a shipping
 * connector (label creation/tracking), and a payment connector (webhook
 * intake) genuinely do different things; forcing a shared method set across
 * all three would either be too generic to be useful or grow unused methods.
 * `verifyCredentials` is the one thing every adapter can and should provide:
 * a cheap real call proving a just-entered/rotated credential actually
 * works, called right after `VaultService.setCredentials`.
 */
export interface IConnectorAdapter {
  readonly provider: ConnectorProvider;
  verifyCredentials(payload: CredentialPayload): Promise<boolean>;
}
