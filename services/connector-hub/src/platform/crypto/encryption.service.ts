import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Env } from '../../config/env.schema';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // standard GCM nonce size — 16 bytes is the block size, not the nonce size; don't conflate them

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

/**
 * The ONE place plaintext third-party credentials touch encryption —
 * `VaultService` calls this, never a repository or controller directly.
 * A fresh random `iv` per encryption call (never reused with the same key,
 * which would break GCM's confidentiality guarantee) — stored alongside the
 * ciphertext since GCM decryption requires it, and it does not need to be
 * secret itself, only unique per encryption.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env>) {
    const masterKey: string = config.get('VAULT_MASTER_KEY', { infer: true })!;
    this.key = Buffer.from(masterKey, 'base64');
  }

  encrypt(plaintext: string): EncryptedPayload {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { ciphertext, iv, authTag };
  }

  decrypt(payload: EncryptedPayload): string {
    const decipher = createDecipheriv(ALGORITHM, this.key, payload.iv);
    decipher.setAuthTag(payload.authTag);
    const plaintext = Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
    return plaintext.toString('utf-8');
  }
}
