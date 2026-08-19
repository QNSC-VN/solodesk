import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { PurchaseNoteService } from '../application/purchase-note.service';
import { CreatePurchaseNoteDto, PurchaseNoteResponseDto } from './purchase-note.dto';
import type { PurchaseNote } from '../domain/procurement.types';

function toDto(n: PurchaseNote): PurchaseNoteResponseDto {
  return {
    id: n.id,
    supplierId: n.supplierId,
    status: n.status,
    totalAmount: n.totalAmount,
    lines: n.lines.map((l) => ({ id: l.id, skuId: l.skuId, lotId: l.lotId, quantity: l.quantity, unitCost: l.unitCost, lineTotal: l.lineTotal })),
  };
}

@ApiTags('purchase-notes')
@Controller('purchase-notes')
export class PurchaseNoteController {
  constructor(private readonly purchaseNoteService: PurchaseNoteService) {}

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Mục 5.2 — a retried request must not receive stock twice' })
  @ApiOperation({ summary: 'Record a purchase from a supplier — receives stock and the purchase note atomically' })
  async create(@Body() dto: CreatePurchaseNoteDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<PurchaseNoteResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }
    const note = await this.purchaseNoteService.recordPurchase(getCurrentTenantId(), idempotencyKey, dto);
    return toDto(note);
  }

  @Get()
  @ApiOperation({ summary: "List the caller's tenant purchase notes" })
  async list(): Promise<PurchaseNoteResponseDto[]> {
    const notes = await this.purchaseNoteService.listPurchaseNotes(getCurrentTenantId());
    return notes.map(toDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a purchase note by id' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseNoteResponseDto> {
    const note = await this.purchaseNoteService.getPurchaseNote(id, getCurrentTenantId());
    return toDto(note);
  }
}
