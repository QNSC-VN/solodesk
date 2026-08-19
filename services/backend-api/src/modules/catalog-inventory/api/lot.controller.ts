import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { InventoryService } from '../application/inventory.service';
import { ReceiveLotDto, StockMutationDto, SellFromSkuDto, LotResponseDto, AvailableQuantityResponseDto } from './lot.dto';
import type { Lot, AvailableQuantity } from '../domain/inventory.types';

function toDto(l: Lot): LotResponseDto {
  return {
    id: l.id,
    skuId: l.skuId,
    lotCode: l.lotCode,
    quantityOnHand: l.quantityOnHand,
    quantityReserved: l.quantityReserved,
    sourceChannel: l.sourceChannel,
  };
}

function toAvailableDto(a: AvailableQuantity): AvailableQuantityResponseDto {
  return { skuId: a.skuId, totalOnHand: a.totalOnHand, totalReserved: a.totalReserved, totalAvailable: a.totalAvailable };
}

@ApiTags('inventory')
@Controller('lots')
export class LotController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('receive')
  @ApiOperation({ summary: 'Receive a new lot into stock (nhập kho)' })
  async receive(@Body() dto: ReceiveLotDto): Promise<LotResponseDto> {
    const lot = await this.inventoryService.receiveLot(getCurrentTenantId(), dto);
    return toDto(lot);
  }

  @Get('available/:skuId')
  @ApiOperation({ summary: 'Total available quantity for a SKU across all lots' })
  async available(@Param('skuId', ParseUUIDPipe) skuId: string): Promise<AvailableQuantityResponseDto> {
    const qty = await this.inventoryService.getAvailableQuantity(skuId, getCurrentTenantId());
    return toAvailableDto(qty);
  }

  @Post(':id/reserve')
  @ApiOperation({ summary: 'Hold quantity against a lot for a pending order' })
  async reserve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StockMutationDto): Promise<LotResponseDto> {
    const lot = await this.inventoryService.reserve(id, getCurrentTenantId(), dto.qty, dto.referenceId);
    return toDto(lot);
  }

  @Post(':id/release')
  @ApiOperation({ summary: 'Release a previous hold (order cancelled/expired)' })
  async release(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StockMutationDto): Promise<LotResponseDto> {
    const lot = await this.inventoryService.release(id, getCurrentTenantId(), dto.qty, dto.referenceId);
    return toDto(lot);
  }

  @Post(':id/consume-reserved')
  @ApiOperation({ summary: 'Confirm a held quantity as shipped/sold' })
  async consumeReserved(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StockMutationDto): Promise<LotResponseDto> {
    const lot = await this.inventoryService.consumeReserved(id, getCurrentTenantId(), dto.qty, dto.referenceId);
    return toDto(lot);
  }

  @Post(':id/consume-direct')
  @ApiOperation({ summary: 'Counter sale, no prior hold — the race-guarded operation (Mục 11)' })
  async consumeDirect(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StockMutationDto): Promise<LotResponseDto> {
    const lot = await this.inventoryService.consumeDirect(id, getCurrentTenantId(), dto.qty, dto.referenceId);
    return toDto(lot);
  }

  @Post('sell')
  @ApiOperation({ summary: 'Sell from a SKU without naming a lot — picks oldest available (FIFO), single-lot only' })
  async sellFromSku(@Body() dto: SellFromSkuDto): Promise<LotResponseDto> {
    const lot = await this.inventoryService.sellFromSku(dto.skuId, getCurrentTenantId(), dto.qty, dto.referenceId);
    return toDto(lot);
  }
}
