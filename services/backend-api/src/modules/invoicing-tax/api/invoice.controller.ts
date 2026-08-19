import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { InvoiceService } from '../application/invoice.service';
import { IssueInvoiceDto, InvoiceResponseDto } from './invoice.dto';
import type { Invoice } from '../domain/invoice.types';

function toDto(i: Invoice): InvoiceResponseDto {
  return {
    id: i.id,
    orderId: i.orderId,
    invoiceNumber: i.invoiceNumber,
    subtotal: i.subtotal,
    taxRate: i.taxRate,
    taxAmount: i.taxAmount,
    totalAmount: i.totalAmount,
    requiresEInvoice: i.requiresEInvoice,
    status: i.status,
    issuedAt: i.issuedAt,
  };
}

@ApiTags('invoices')
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post()
  @ApiOperation({ summary: 'Issue an invoice for a confirmed order — tax calculated via the versioned rule engine' })
  async issue(@Body() dto: IssueInvoiceDto): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceService.issueInvoice(getCurrentTenantId(), dto.orderId);
    return toDto(invoice);
  }

  @Get()
  @ApiOperation({ summary: "List the caller's tenant invoices" })
  async list(): Promise<InvoiceResponseDto[]> {
    const invoices = await this.invoiceService.listInvoices(getCurrentTenantId());
    return invoices.map(toDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an invoice by id' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceService.getInvoice(id, getCurrentTenantId());
    return toDto(invoice);
  }
}
