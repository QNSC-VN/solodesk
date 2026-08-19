import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * argon2id — OWASP's current recommended default over bcrypt. The one piece
 * of "real login" @qnsc-vn/identity genuinely has zero code for (see
 * CLAUDE.md's "Real login" section).
 */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
}
