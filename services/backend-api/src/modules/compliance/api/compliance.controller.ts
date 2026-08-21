import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { ComplianceService } from '../application/compliance.service';
import { ComplianceDocumentResponseDto, CreateComplianceDocumentDto, UpdateComplianceDocumentDto } from './compliance.dto';
import type { ComplianceDocumentView } from '../domain/compliance.types';

function toDto(v: ComplianceDocumentView): ComplianceDocumentResponseDto {
  return {
    id: v.id,
    docType: v.docType,
    documentNumber: v.documentNumber,
    issuedOn: v.issuedOn,
    expiresOn: v.expiresOn,
    isMandatory: v.isMandatory,
    notes: v.notes,
    status: v.status,
    daysRemaining: v.daysRemaining,
    incompleteCount: v.incompleteCount,
  };
}

@ApiTags('compliance')
@Controller('compliance/documents')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get()
  @ApiOperation({ summary: "List the tenant's compliance documents with derived statuses (missing/expired/expiring/valid) and the 'chưa đủ' count" })
  async list(): Promise<ComplianceDocumentResponseDto[]> {
    return (await this.complianceService.listDocuments(getCurrentTenantId())).map(toDto);
  }

  @Post()
  @ApiOperation({ summary: 'Record a compliance document (a NULL documentNumber records a known-required-but-missing one)' })
  async create(@Headers('idempotency-key') idempotencyKey: string | undefined, @Body() dto: CreateComplianceDocumentDto): Promise<ComplianceDocumentResponseDto> {
    if (!idempotencyKey) throw new BadRequestException('Idempotency-Key header is required.');
    return toDto(await this.complianceService.createDocument(getCurrentTenantId(), idempotencyKey, dto));
  }

  @Patch(':id')
  @ApiOperation({ summary: "Update a document — editing expiresOn after renewal IS the renewal record (no separate renewal flow)" })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateComplianceDocumentDto): Promise<ComplianceDocumentResponseDto> {
    return toDto(await this.complianceService.updateDocument(id, getCurrentTenantId(), dto));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a document row (e.g. recorded by mistake, or the requirement no longer applies)' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.complianceService.deleteDocument(id, getCurrentTenantId());
  }
}
