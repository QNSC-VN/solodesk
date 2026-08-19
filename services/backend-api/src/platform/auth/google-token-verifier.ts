import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export const GOOGLE_VERIFIER_OPTIONS = Symbol('GOOGLE_VERIFIER_OPTIONS');

export interface GoogleVerifierOptions {
  clientId: string;
  /** Overridable in tests to avoid a real network call — same pattern as
   * @qnsc-vn/identity's EntraVerifierOptions.jwksResolver. */
  jwksResolver?: (url: URL) => JWTVerifyGetKey;
}

export interface GoogleClaims {
  /** Google's stable per-user subject id. */
  sub: string;
  email: string;
  displayName: string;
}

const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/**
 * Provider-agnostic verification, hand-rolled for Google specifically rather
 * than routed through @qnsc-vn/identity's ConnectionRegistry/OidcTokenVerifier
 * broker — that broker resolves a FIXED workspaceId per `sso_connections` row
 * (`ResolvedConnection.workspaceId: string`, non-nullable), which cannot
 * express "a brand-new user creates their own new tenant on first login".
 * See CLAUDE.md's "Real login" section for the full reasoning. Same shape as
 * the package's own EntraTokenVerifier: verify signature + issuer + audience
 * against the provider's real JWKS, throw on any failure.
 */
@Injectable()
export class GoogleTokenVerifier {
  private readonly jwks: JWTVerifyGetKey;

  constructor(@Inject(GOOGLE_VERIFIER_OPTIONS) private readonly options: GoogleVerifierOptions) {
    this.jwks = (options.jwksResolver ?? createRemoteJWKSet)(GOOGLE_JWKS_URL);
  }

  async verify(idToken: string): Promise<GoogleClaims> {
    const { payload } = await jwtVerify(idToken, this.jwks, {
      issuer: GOOGLE_ISSUERS,
      audience: this.options.clientId,
    });

    const sub = payload.sub;
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    if (!sub || !email) {
      throw new Error('Google id_token missing required sub/email claims.');
    }

    const displayName = typeof payload.name === 'string' ? payload.name : email;
    return { sub, email: email.toLowerCase().trim(), displayName };
  }
}
