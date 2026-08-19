/**
 * DEV/TEST-ONLY token minting. Uses `DEV_JWT_PRIVATE_KEY` to sign a real ES256
 * access token matching `JwtPayload`, since no real login/SSO flow exists yet
 * in this repo (see src/platform/auth/auth.module.ts's header comment).
 *
 * `env.schema.ts` refuses to boot the app at all if `DEV_JWT_PRIVATE_KEY` is
 * set with `NODE_ENV=production` — this script must never run against a real
 * deployed environment, only local Postgres+Valkey.
 *
 * Usage: tsx scripts/mint-dev-token.ts <tenantId> [userId]
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { uuidv7 } from 'uuidv7';
import { signAccessToken } from '@qnsc-vn/identity';

const [, , tenantId, userIdArg] = process.argv;
if (!tenantId) {
  console.error('Usage: tsx scripts/mint-dev-token.ts <tenantId> [userId]');
  process.exit(1);
}

const privateKey = process.env.DEV_JWT_PRIVATE_KEY;
if (!privateKey) {
  throw new Error('DEV_JWT_PRIVATE_KEY not set — see .env.example.');
}

const userId = userIdArg ?? uuidv7();

const { accessToken, expiresIn } = signAccessToken(
  (payload) =>
    jwt.sign(payload, privateKey, {
      algorithm: 'ES256',
      issuer: process.env.JWT_ISSUER ?? 'solodesk',
      audience: process.env.JWT_AUDIENCE ?? 'solodesk-api',
      expiresIn: '1h',
    }),
  '1h',
  {
    userId,
    contextId: tenantId,
    sessionId: uuidv7(),
    claims: {},
    authMethod: 'password',
  },
);

console.log(JSON.stringify({ accessToken, expiresIn, userId, tenantId }, null, 2));
