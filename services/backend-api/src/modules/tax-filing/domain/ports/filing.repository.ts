import type { Db } from '../../../../db/client';
import type { Filing, CreateFilingInput } from '../tax-filing.types';

export const FILING_REPOSITORY = Symbol('FILING_REPOSITORY');

export interface IFilingRepository {
  findByPeriod(tenantId: string, quarter: number, year: number): Promise<Filing | null>;
  create(tenantId: string, input: CreateFilingInput, tx: Db): Promise<Filing>;
  listByTenant(tenantId: string): Promise<Filing[]>;
}
