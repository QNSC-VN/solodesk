import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { CustomerService } from '../application/customer.service';
import { GetCustomerDetailQueryDto, CustomerSummaryResponseDto, CustomerDetailResponseDto } from './customer.dto';
import type { CustomerSummary, CustomerDetail } from '../domain/customer.types';

function toSummaryDto(c: CustomerSummary): CustomerSummaryResponseDto {
  return {
    name: c.name,
    orderCount: c.orderCount,
    totalSpent: c.totalSpent,
    firstOrderAt: c.firstOrderAt?.toISOString() ?? null,
    lastOrderAt: c.lastOrderAt?.toISOString() ?? null,
    primaryChannel: c.primaryChannel,
    bookingCount: c.bookingCount,
  };
}

function toDetailDto(c: CustomerDetail): CustomerDetailResponseDto {
  return {
    ...toSummaryDto(c),
    orders: c.orders.map((o) => ({ id: o.id, channel: o.channel, status: o.status, totalAmount: o.totalAmount, createdAt: o.createdAt.toISOString() })),
    bookings: c.bookings.map((b) => ({ id: b.id, resourceId: b.resourceId, status: b.status, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), partySize: b.partySize })),
  };
}

/**
 * No stored Customer entity — a real aggregate over `sales.orders` +
 * `booking.bookings`, grouped by the exact `customerName` string, same
 * shape as the mockup's own derived "Khách hàng" view (see
 * `domain/customer.types.ts`'s own doc comment). No `tenantId` param —
 * every route scoped to the caller's own tenant, same convention as
 * `SkuController`/`TaxFilingController`.
 */
@ApiTags('customers')
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  @ApiOperation({ summary: "Customer aggregate list (spend/order-count/last-purchase), highest spender first — derived, not a stored entity" })
  async list(): Promise<CustomerSummaryResponseDto[]> {
    const customers = await this.customerService.listCustomers(getCurrentTenantId());
    return customers.map(toSummaryDto);
  }

  @Get('detail')
  @ApiOperation({ summary: 'Customer detail — real order + booking history for an exact customer-name match' })
  async detail(@Query() query: GetCustomerDetailQueryDto): Promise<CustomerDetailResponseDto> {
    const detail = await this.customerService.getCustomerDetail(getCurrentTenantId(), query.name);
    return toDetailDto(detail);
  }
}
