import type { TaxRateGroup, RateGroupCode } from '../tax-filing.types';

export const RATE_GROUP_REPOSITORY = Symbol('RATE_GROUP_REPOSITORY');

export interface IRateGroupRepository {
  findByCode(code: RateGroupCode): Promise<TaxRateGroup | null>;
}
