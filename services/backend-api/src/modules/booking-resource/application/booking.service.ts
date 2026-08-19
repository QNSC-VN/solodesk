import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConflictException, NotFoundException } from '@qnsc-vn/platform-http';
import { assertTenantMatchesSession } from '../../../platform/tenant-context';
import { BOOKING_REPOSITORY, type IBookingRepository } from '../domain/ports/booking.repository';
import { ResourceService } from './resource.service';
import type { Booking, RequestHoldInput } from '../domain/booking.types';

@Injectable()
export class BookingService {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepository: IBookingRepository,
    private readonly resourceService: ResourceService,
  ) {}

  async requestHold(tenantId: string, input: RequestHoldInput): Promise<Booking> {
    assertTenantMatchesSession(tenantId);
    if (input.endsAt <= input.startsAt) {
      throw new BadRequestException('endsAt must be after startsAt.');
    }

    await this.resourceService.getResource(input.resourceId, tenantId); // 404s if missing/cross-tenant

    const booking = await this.bookingRepository.requestHold(tenantId, input);
    if (!booking) {
      throw new ConflictException('CAPACITY_UNAVAILABLE', `Resource ${input.resourceId} has no available capacity for the requested window.`);
    }
    return booking;
  }

  async confirmBooking(id: string, tenantId: string): Promise<Booking> {
    assertTenantMatchesSession(tenantId);
    const booking = await this.bookingRepository.confirm(id, tenantId);
    if (!booking) {
      throw new ConflictException('HOLD_NOT_CONFIRMABLE', `Booking ${id} is not an unexpired hold.`);
    }
    return booking;
  }

  async cancelBooking(id: string, tenantId: string): Promise<Booking> {
    assertTenantMatchesSession(tenantId);
    const booking = await this.bookingRepository.cancel(id, tenantId);
    if (!booking) {
      throw new ConflictException('BOOKING_NOT_CANCELLABLE', `Booking ${id} is not held or confirmed.`);
    }
    return booking;
  }

  async markNoShow(id: string, tenantId: string): Promise<Booking> {
    assertTenantMatchesSession(tenantId);
    const booking = await this.bookingRepository.markNoShow(id, tenantId);
    if (!booking) {
      throw new ConflictException('BOOKING_NOT_CONFIRMED', `Booking ${id} is not confirmed.`);
    }
    return booking;
  }

  async getBooking(id: string, tenantId: string): Promise<Booking> {
    assertTenantMatchesSession(tenantId);
    const booking = await this.bookingRepository.findById(id, tenantId);
    if (!booking) {
      throw new NotFoundException('BOOKING_NOT_FOUND', `Booking ${id} not found`);
    }
    return booking;
  }

  async listByResource(resourceId: string, tenantId: string): Promise<Booking[]> {
    assertTenantMatchesSession(tenantId);
    await this.resourceService.getResource(resourceId, tenantId); // 404s if missing/cross-tenant
    return this.bookingRepository.listByResource(resourceId, tenantId);
  }
}
