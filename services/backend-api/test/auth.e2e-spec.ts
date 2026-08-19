import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CacheService } from '@qnsc-vn/platform-cache';
import { generateKeyPair, SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { users } from '../src/db/schema/users';
import { authTokens } from '../src/db/schema/auth-tokens';
import type { Env } from '../src/config/env.schema';
import { PasswordService } from '../src/platform/auth/password.service';
import { GoogleTokenVerifier } from '../src/platform/auth/google-token-verifier';
import { EmailService } from '../src/platform/email.service';
import { UserDrizzleRepository } from '../src/modules/auth/infrastructure/persistence/user.drizzle-repository';
import { AuthSessionDrizzleRepository } from '../src/modules/auth/infrastructure/persistence/auth-session.drizzle-repository';
import { TenantClaimsProvider } from '../src/modules/auth/infrastructure/tenant-claims-provider';
import { AuthAuditService } from '../src/modules/auth/infrastructure/auth-audit.service';
import { SessionMinter } from '../src/modules/auth/application/session-minter';
import { SignupService } from '../src/modules/auth/application/signup.service';
import { LoginService } from '../src/modules/auth/application/login.service';
import { TenantDrizzleRepository } from '../src/modules/identity-tenant/infrastructure/persistence/tenant.drizzle-repository';
import { TenantMemberDrizzleRepository } from '../src/modules/identity-tenant/infrastructure/persistence/tenant-member.drizzle-repository';

/**
 * Real Postgres + real Valkey, no mocks — same discipline as every other
 * e2e spec in this repo. Services constructed directly (no Nest DI
 * bootstrap), same precedent as internal-onboarding.e2e-spec.ts. Google
 * login uses a locally-generated ES256 keypair + GoogleTokenVerifier's
 * injectable `jwksResolver` override — same testability shape as
 * @qnsc-vn/identity's own EntraTokenVerifier, no real network call.
 */

const config = new ConfigService<Env>(process.env as unknown as Env);
const jwt = new JwtService({
  privateKey: process.env.JWT_PRIVATE_KEY!,
  signOptions: { algorithm: 'ES256', issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, expiresIn: '15m' },
});
const cache = new CacheService({ url: process.env.REDIS_URL!, keyPrefix: 'solodesk-test-auth:', mode: 'required' });

const tenantRepository = new TenantDrizzleRepository();
const memberRepository = new TenantMemberDrizzleRepository();
const userRepository = new UserDrizzleRepository();
const sessionRepository = new AuthSessionDrizzleRepository();
const claimsProvider = new TenantClaimsProvider(memberRepository);
const auditService = new AuthAuditService();
const passwordService = new PasswordService();
const emailService = new EmailService(config);
const sessionMinter = new SessionMinter(jwt, userRepository, sessionRepository, claimsProvider, auditService);

let googleKeyPair: Awaited<ReturnType<typeof generateKeyPair>> | undefined;
async function getGoogleVerifier(): Promise<GoogleTokenVerifier> {
  googleKeyPair ??= await generateKeyPair('ES256');
  return new GoogleTokenVerifier({
    clientId: 'test-google-client-id',
    jwksResolver: () => async () => googleKeyPair!.publicKey,
  });
}

async function signGoogleIdToken(sub: string, email: string, name: string): Promise<string> {
  googleKeyPair ??= await generateKeyPair('ES256');
  return new SignJWT({ email, name })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuer('https://accounts.google.com')
    .setAudience('test-google-client-id')
    .setSubject(sub)
    .setExpirationTime('5m')
    .sign(googleKeyPair.privateKey);
}

async function makeSignupService(): Promise<SignupService> {
  return new SignupService(
    userRepository,
    sessionRepository,
    tenantRepository,
    memberRepository,
    passwordService,
    await getGoogleVerifier(),
    emailService,
    sessionMinter,
  );
}

const loginService = new LoginService(userRepository, memberRepository, passwordService, sessionMinter, cache);

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

/** signupWithPassword only stores a token HASH — tests capture the raw link EmailService would have sent instead of reading the DB. */
function extractTokenFromHtml(html: string): string {
  const match = /token=([A-Za-z0-9_-]+)/.exec(html);
  if (!match) throw new Error(`No token found in email HTML: ${html}`);
  return match[1]!;
}

describe('Real login — signup, email verification, login, Google, password reset', () => {
  it('signup creates tenant + user + owner membership atomically, and blocks login before verification', async () => {
    const email = uniqueEmail('signup');
    let capturedHtml = '';
    const spyEmail = { send: async (input: { html: string }) => { capturedHtml = input.html; } } as unknown as EmailService;
    const signupService = new SignupService(
      userRepository,
      sessionRepository,
      tenantRepository,
      memberRepository,
      passwordService,
      await getGoogleVerifier(),
      spyEmail,
      sessionMinter,
    );

    await signupService.signupWithPassword({ email, password: 'correct horse battery', legalName: 'Quán Test Signup', industry: 'food_beverage' });

    const [userRow] = await db.select().from(users).where(eq(users.email, email));
    expect(userRow).toBeDefined();
    expect(userRow!.emailVerified).toBe(false);

    const tenantIds = await memberRepository.findTenantIdsForUser(userRow!.id);
    expect(tenantIds).toHaveLength(1);

    await expect(loginService.login(email, 'correct horse battery')).rejects.toThrow(/verify your email/i);

    const token = extractTokenFromHtml(capturedHtml);
    const result = await signupService.verifyEmail(token);
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.email).toBe(email);

    const loggedIn = await loginService.login(email, 'correct horse battery');
    expect(loggedIn.user.email).toBe(email);
  });

  it('rejects a duplicate signup email', async () => {
    const email = uniqueEmail('dup');
    const signupService = await makeSignupService();
    await signupService.signupWithPassword({ email, password: 'correct horse battery', legalName: 'Dup Test', industry: 'tourism' });
    await expect(
      signupService.signupWithPassword({ email, password: 'another password', legalName: 'Dup Test 2', industry: 'tourism' }),
    ).rejects.toThrow(/EMAIL_ALREADY_REGISTERED|already exists/i);
  });

  it('rejects wrong password and rejects a nonexistent email the same way (no user-existence leak)', async () => {
    const email = uniqueEmail('wrongpw');
    let capturedHtml = '';
    const spyEmail = { send: async (input: { html: string }) => { capturedHtml = input.html; } } as unknown as EmailService;
    const signupService = new SignupService(
      userRepository, sessionRepository, tenantRepository, memberRepository, passwordService, await getGoogleVerifier(), spyEmail, sessionMinter,
    );
    await signupService.signupWithPassword({ email, password: 'the real password', legalName: 'Wrong PW Test', industry: 'agriculture' });
    await signupService.verifyEmail(extractTokenFromHtml(capturedHtml));

    await expect(loginService.login(email, 'totally wrong')).rejects.toThrow(/INVALID_CREDENTIALS|Incorrect/i);
    await expect(loginService.login(uniqueEmail('never-signed-up'), 'anything')).rejects.toThrow(/INVALID_CREDENTIALS|Incorrect/i);
  });

  it('Google login creates a new tenant on first login and reuses it on a second login with the same sub', async () => {
    const sub = `google-sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = uniqueEmail('google');
    const idToken = await signGoogleIdToken(sub, email, 'Google Test User');
    const signupService = await makeSignupService();

    const first = await signupService.loginWithGoogle(idToken);
    expect(first.user.email).toBe(email);

    const [userRow] = await db.select().from(users).where(eq(users.email, email));
    const tenantIdsAfterFirst = await memberRepository.findTenantIdsForUser(userRow!.id);
    expect(tenantIdsAfterFirst).toHaveLength(1);

    const idToken2 = await signGoogleIdToken(sub, email, 'Google Test User');
    const second = await signupService.loginWithGoogle(idToken2);
    expect(second.user.email).toBe(email);

    const tenantIdsAfterSecond = await memberRepository.findTenantIdsForUser(userRow!.id);
    expect(tenantIdsAfterSecond).toHaveLength(1);
    expect(tenantIdsAfterSecond[0]).toBe(tenantIdsAfterFirst[0]);
  });

  it('forgot/reset password round-trip revokes existing sessions', async () => {
    const email = uniqueEmail('reset');
    let verifyHtml = '';
    let resetHtml = '';
    const spyEmail = {
      send: async (input: { html: string; subject: string }) => {
        if (input.subject.includes('Xác thực')) verifyHtml = input.html;
        else resetHtml = input.html;
      },
    } as unknown as EmailService;
    const signupService = new SignupService(
      userRepository, sessionRepository, tenantRepository, memberRepository, passwordService, await getGoogleVerifier(), spyEmail, sessionMinter,
    );

    await signupService.signupWithPassword({ email, password: 'original password', legalName: 'Reset Test', industry: 'food_beverage' });
    await signupService.verifyEmail(extractTokenFromHtml(verifyHtml));
    const session = await loginService.login(email, 'original password');

    await signupService.forgotPassword(email);
    const resetToken = extractTokenFromHtml(resetHtml);
    await signupService.resetPassword(resetToken, 'brand new password');

    // Old refresh token must be revoked — findByTokenHash still finds the
    // row, but it's revoked (the AuthService.refresh() flow the real
    // package binds checks this, not re-implemented in this test).
    const { hashToken } = await import('@qnsc-vn/identity');
    const revokedSession = await sessionRepository.findByTokenHash(hashToken(session.refreshToken));
    expect(revokedSession?.isRevoked).toBe(true);

    await expect(loginService.login(email, 'original password')).rejects.toThrow(/INVALID_CREDENTIALS|Incorrect/i);
    const relogged = await loginService.login(email, 'brand new password');
    expect(relogged.user.email).toBe(email);
  });

  it('the email_verify authTokens row carries the tenant id set at signup', async () => {
    const email = uniqueEmail('tokenshape');
    const spyEmail = { send: async () => {} } as unknown as EmailService;
    const signupService = new SignupService(
      userRepository, sessionRepository, tenantRepository, memberRepository, passwordService, await getGoogleVerifier(), spyEmail, sessionMinter,
    );
    await signupService.signupWithPassword({ email, password: 'whatever password', legalName: 'Token Shape Test', industry: 'tourism' });

    const [userRow] = await db.select().from(users).where(eq(users.email, email));
    const [tokenRow] = await db.select().from(authTokens).where(eq(authTokens.userId, userRow!.id));
    expect(tokenRow!.purpose).toBe('email_verify');
    expect(tokenRow!.tenantId).toBeTruthy();
  });
});
