/**
 * DEV/TEST-ONLY token minting — same shape as backend-api/connector-hub's
 * script of the same name. Usage: tsx scripts/mint-dev-token.ts <tenantId> [userId]
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
