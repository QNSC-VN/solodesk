import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { SupplierService } from '../application/supplier.service';
import { CreateSupplierDto, SupplierResponseDto } from './supplier.dto';
import type { Supplier } from '../domain/procurement.types';

function toDto(s: Supplier): SupplierResponseDto {
  return { id: s.id, name: s.name, contactInfo: s.contactInfo, taxCode: s.taxCode, isActive: s.isActive };
}

@ApiTags('suppliers')
@Controller('suppliers')
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Post()
  @ApiOperation({ summary: 'Register a supplier (farmer/input provider)' })
  async create(@Body() dto: CreateSupplierDto): Promise<SupplierResponseDto> {
    const supplier = await this.supplierService.createSupplier(getCurrentTenantId(), dto);
    return toDto(supplier);
  }

  @Get()
  @ApiOperation({ summary: "List the caller's tenant suppliers" })
  async list(): Promise<SupplierResponseDto[]> {
    const suppliers = await this.supplierService.listSuppliers(getCurrentTenantId());
    return suppliers.map(toDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a supplier by id' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierResponseDto> {
    const supplier = await this.supplierService.getSupplier(id, getCurrentTenantId());
    return toDto(supplier);
  }
}
