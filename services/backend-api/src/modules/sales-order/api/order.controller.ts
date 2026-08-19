import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { OrderService } from '../application/order.service';
import { CreateOrderDto, OrderResponseDto } from './order.dto';
import type { Order } from '../domain/order.types';

function toDto(o: Order): OrderResponseDto {
  return {
    id: o.id,
    channel: o.channel,
    status: o.status,
    customerName: o.customerName,
    totalAmount: o.totalAmount,
    createdAt: o.createdAt.toISOString(),
    lines: o.lines.map((l) => ({
      id: l.id,
      skuId: l.skuId,
      lotId: l.lotId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
  };
}

@ApiTags('orders')
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Mục 5.2 — required, not optional: prevents a client retry from double-charging stock' })
  @ApiOperation({ summary: 'Place an order — consumes stock atomically with the order record' })
  async create(@Body() dto: CreateOrderDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<OrderResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }
    const order = await this.orderService.placeOrder(getCurrentTenantId(), idempotencyKey, dto);
    return toDto(order);
  }

  @Get()
  @ApiOperation({ summary: "List the caller's tenant orders" })
  async list(): Promise<OrderResponseDto[]> {
    const orders = await this.orderService.listOrders(getCurrentTenantId());
    return orders.map(toDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an order by id' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<OrderResponseDto> {
    const order = await this.orderService.getOrder(id, getCurrentTenantId());
    return toDto(order);
  }
}
