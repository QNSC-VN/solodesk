import { Controller, Get, Param, ParseUUIDPipe, Post, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { BookingService } from '../application/booking.service';
import { RequestHoldDto, BookingResponseDto } from './booking.dto';
import type { Booking } from '../domain/booking.types';

function toDto(b: Booking): BookingResponseDto {
  return {
    id: b.id,
    resourceId: b.resourceId,
    customerName: b.customerName,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    partySize: b.partySize,
    status: b.status,
    holdExpiresAt: b.holdExpiresAt,
  };
}

@ApiTags('bookings')
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  @ApiOperation({ summary: 'Place a temporary hold on a resource for a time window — capacity-guarded (Mục "booking-conflict")' })
  async requestHold(@Body() dto: RequestHoldDto): Promise<BookingResponseDto> {
    const booking = await this.bookingService.requestHold(getCurrentTenantId(), {
      resourceId: dto.resourceId,
      customerName: dto.customerName,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
      ...(dto.partySize !== undefined ? { partySize: dto.partySize } : {}),
      ...(dto.holdMinutes !== undefined ? { holdMinutes: dto.holdMinutes } : {}),
    });
    return toDto(booking);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm a still-unexpired hold' })
  async confirm(@Param('id', ParseUUIDPipe) id: string): Promise<BookingResponseDto> {
    const booking = await this.bookingService.confirmBooking(id, getCurrentTenantId());
    return toDto(booking);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a held or confirmed booking' })
  async cancel(@Param('id', ParseUUIDPipe) id: string): Promise<BookingResponseDto> {
    const booking = await this.bookingService.cancelBooking(id, getCurrentTenantId());
    return toDto(booking);
  }

  @Post(':id/no-show')
  @ApiOperation({ summary: 'Mark a confirmed booking as a no-show' })
  async noShow(@Param('id', ParseUUIDPipe) id: string): Promise<BookingResponseDto> {
    const booking = await this.bookingService.markNoShow(id, getCurrentTenantId());
    return toDto(booking);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a booking by id' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<BookingResponseDto> {
    const booking = await this.bookingService.getBooking(id, getCurrentTenantId());
    return toDto(booking);
  }

  @Get('by-resource/:resourceId')
  @ApiOperation({ summary: 'List bookings for a resource' })
  async listByResource(@Param('resourceId', ParseUUIDPipe) resourceId: string): Promise<BookingResponseDto[]> {
    const list = await this.bookingService.listByResource(resourceId, getCurrentTenantId());
    return list.map(toDto);
  }
}
