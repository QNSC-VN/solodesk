import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotFoundException } from '@qnsc-vn/platform-http';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { NegotiatedPriceService } from '../application/negotiated-price.service';
import { SetNegotiatedPriceDto, NegotiatedPriceResponseDto } from './negotiated-price.dto';
import type { NegotiatedPrice } from '../domain/procurement.types';

function toDto(p: NegotiatedPrice): NegotiatedPriceResponseDto {
  return { id: p.id, supplierId: p.supplierId, skuId: p.skuId, unitCost: p.unitCost, effectiveFrom: p.effectiveFrom, effectiveTo: p.effectiveTo };
}

@ApiTags('negotiated-prices')
@Controller('suppliers/:supplierId/negotiated-prices')
export class NegotiatedPriceController {
  constructor(private readonly negotiatedPriceService: NegotiatedPriceService) {}

  @Post()
  @ApiOperation({ summary: 'Set the active negotiated price for a supplier+SKU — closes whatever was active before' })
  async set(@Param('supplierId', ParseUUIDPipe) supplierId: string, @Body() dto: SetNegotiatedPriceDto): Promise<NegotiatedPriceResponseDto> {
    const price = await this.negotiatedPriceService.setPrice(
      getCurrentTenantId(),
      supplierId,
      dto.skuId,
      dto.unitCost,
      dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
    );
    return toDto(price);
  }

  @Get(':skuId')
  @ApiOperation({ summary: 'Get the currently active negotiated price for a supplier+SKU' })
  async getActive(@Param('supplierId', ParseUUIDPipe) supplierId: string, @Param('skuId', ParseUUIDPipe) skuId: string): Promise<NegotiatedPriceResponseDto> {
    const price = await this.negotiatedPriceService.getActivePrice(getCurrentTenantId(), supplierId, skuId);
    if (!price) {
      throw new NotFoundException('NEGOTIATED_PRICE_NOT_FOUND', `No active negotiated price for supplier ${supplierId} and SKU ${skuId}.`);
    }
    return toDto(price);
  }
}
