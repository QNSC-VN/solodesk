import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@qnsc-vn/platform-http';
import { assertTenantMatchesSession } from '../../../platform/tenant-context';
import { RESOURCE_REPOSITORY, type IResourceRepository } from '../domain/ports/resource.repository';
import type { Resource, CreateResourceInput } from '../domain/booking.types';

@Injectable()
export class ResourceService {
  constructor(@Inject(RESOURCE_REPOSITORY) private readonly resourceRepository: IResourceRepository) {}

  async createResource(tenantId: string, input: CreateResourceInput): Promise<Resource> {
    assertTenantMatchesSession(tenantId);
    return this.resourceRepository.create(tenantId, input);
  }

  async getResource(id: string, tenantId: string): Promise<Resource> {
    assertTenantMatchesSession(tenantId);
    const resource = await this.resourceRepository.findById(id, tenantId);
    if (!resource) {
      throw new NotFoundException('RESOURCE_NOT_FOUND', `Resource ${id} not found`);
    }
    return resource;
  }

  async listResources(tenantId: string): Promise<Resource[]> {
    assertTenantMatchesSession(tenantId);
    return this.resourceRepository.listByTenant(tenantId);
  }
}
