import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { ResourceService } from '../application/resource.service';
import { CreateResourceDto, ResourceResponseDto } from './resource.dto';
import type { Resource } from '../domain/booking.types';

function toDto(r: Resource): ResourceResponseDto {
  return { id: r.id, name: r.name, resourceType: r.resourceType, capacity: r.capacity, isActive: r.isActive };
}

@ApiTags('resources')
@Controller('resources')
export class ResourceController {
  constructor(private readonly resourceService: ResourceService) {}

  @Post()
  @ApiOperation({ summary: 'Create a bookable resource (room, table, tour seats, equipment)' })
  async create(@Body() dto: CreateResourceDto): Promise<ResourceResponseDto> {
    const resource = await this.resourceService.createResource(getCurrentTenantId(), dto);
    return toDto(resource);
  }

  @Get()
  @ApiOperation({ summary: "List the caller's tenant resources" })
  async list(): Promise<ResourceResponseDto[]> {
    const resources = await this.resourceService.listResources(getCurrentTenantId());
    return resources.map(toDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a resource by id' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<ResourceResponseDto> {
    const resource = await this.resourceService.getResource(id, getCurrentTenantId());
    return toDto(resource);
  }
}
