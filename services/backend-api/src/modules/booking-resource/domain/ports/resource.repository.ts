import type { Resource, CreateResourceInput } from '../booking.types';

export const RESOURCE_REPOSITORY = Symbol('RESOURCE_REPOSITORY');

export interface IResourceRepository {
  findById(id: string, tenantId: string): Promise<Resource | null>;
  listByTenant(tenantId: string): Promise<Resource[]>;
  create(tenantId: string, input: CreateResourceInput): Promise<Resource>;
}
