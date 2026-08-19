import { Injectable } from '@nestjs/common';
import type { ITransactionRunner } from '@qnsc-vn/identity';
import { db, type Db } from '../../../db/client';

/** Trivial adapter binding @qnsc-vn/identity's `ITransactionRunner` port to Drizzle. */
@Injectable()
export class AuthTransactionRunner implements ITransactionRunner<Db> {
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    return db.transaction(fn);
  }
}
