import { Module } from '@nestjs/common';
import { ResourceService } from './application/resource.service';
import { BookingService } from './application/booking.service';
import { ResourceController } from './api/resource.controller';
import { BookingController } from './api/booking.controller';
import { ResourceDrizzleRepository } from './infrastructure/persistence/resource.drizzle-repository';
import { BookingDrizzleRepository } from './infrastructure/persistence/booking.drizzle-repository';
import { RESOURCE_REPOSITORY } from './domain/ports/resource.repository';
import { BOOKING_REPOSITORY } from './domain/ports/booking.repository';

@Module({
  controllers: [ResourceController, BookingController],
  providers: [
    ResourceService,
    BookingService,
    { provide: RESOURCE_REPOSITORY, useClass: ResourceDrizzleRepository },
    { provide: BOOKING_REPOSITORY, useClass: BookingDrizzleRepository },
  ],
  exports: [ResourceService, BookingService],
})
export class BookingResourceModule {}
