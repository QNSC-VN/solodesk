import { Injectable, Module } from '@nestjs/common';
import type { IConnectorAdapter } from './connector.interface';
import type { ConnectorProvider, CredentialPayload } from '../vault/domain/vault.types';

/**
 * Every provider named in docs/ARCHITECTURE.md Section 8 that is NOT one of
 * the 3 fully-wired reference connectors (SePay, GHN, Shopee — see their own
 * folders). Each of these throws loudly rather than pretending to work —
 * an honest scope cut, not a silent gap. Real credential-signing/API-shape
 * logic per provider is deliberately NOT fabricated here (Vietnam e-invoice
 * XML/SOAP shapes, TikTok Shop OAuth, Lazada's signature scheme, etc. are
 * each non-trivial and unverifiable without live credentials — see the
 * scope decision recorded in this repo's CLAUDE.md).
 *
 * To promote one of these to a real adapter: move it to its own
 * `connectors/<provider>/<provider>.adapter.ts` following `sepay.adapter.ts`'s
 * shape (implements `IConnectorAdapter`, wraps calls in `callWithResilience`,
 * uses `connectorFetch` for the short client-level timeout), remove it from
 * this file, and register it in its own module instead of `StubConnectorsModule`.
 */
function makeStubAdapter(provider: ConnectorProvider, displayName: string) {
  @Injectable()
  class StubAdapter implements IConnectorAdapter {
    readonly provider = provider;
    async verifyCredentials(_payload: CredentialPayload): Promise<boolean> {
      throw new Error(`${displayName} adapter is not implemented yet — scaffolded interface only. Real API integration is future work (see CLAUDE.md's connector-hub scope note).`);
    }
  }
  Object.defineProperty(StubAdapter, 'name', { value: `${displayName.replace(/[^a-zA-Z0-9]/g, '')}StubAdapter` });
  return StubAdapter;
}

export class TiktokShopAdapter extends makeStubAdapter('tiktok_shop', 'TikTok Shop') {}
export class LazadaAdapter extends makeStubAdapter('lazada', 'Lazada') {}
export class GhtkAdapter extends makeStubAdapter('ghtk', 'GHTK') {}
export class ViettelpostAdapter extends makeStubAdapter('viettelpost', 'ViettelPost') {}
export class MisaMeinvoiceAdapter extends makeStubAdapter('misa_meinvoice', 'MISA meInvoice') {}
export class ViettelSinvoiceAdapter extends makeStubAdapter('viettel_sinvoice', 'Viettel S-Invoice') {}
export class VnptInvoiceAdapter extends makeStubAdapter('vnpt_invoice', 'VNPT Invoice') {}
export class BookingComAdapter extends makeStubAdapter('booking_com', 'Booking.com') {}
export class AgodaAdapter extends makeStubAdapter('agoda', 'Agoda') {}
// STUB — pending Tax Dept. API (same note as docs/ARCHITECTURE.md Section 8).
export class NationalFreePlatformAdapter extends makeStubAdapter('national_free_platform', 'National Free e-Invoice Platform') {}

@Module({
  providers: [
    TiktokShopAdapter,
    LazadaAdapter,
    GhtkAdapter,
    ViettelpostAdapter,
    MisaMeinvoiceAdapter,
    ViettelSinvoiceAdapter,
    VnptInvoiceAdapter,
    BookingComAdapter,
    AgodaAdapter,
    NationalFreePlatformAdapter,
  ],
  exports: [
    TiktokShopAdapter,
    LazadaAdapter,
    GhtkAdapter,
    ViettelpostAdapter,
    MisaMeinvoiceAdapter,
    ViettelSinvoiceAdapter,
    VnptInvoiceAdapter,
    BookingComAdapter,
    AgodaAdapter,
    NationalFreePlatformAdapter,
  ],
})
export class StubConnectorsModule {}
