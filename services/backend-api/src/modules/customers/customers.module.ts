import { Module } from '@nestjs/common';
import { CustomerService } from './application/customer.service';
import { CustomerController } from './api/customer.controller';
import { CustomerDrizzleRepository } from './infrastructure/persistence/customer.drizzle-repository';
import { CUSTOMER_REPOSITORY } from './domain/ports/customer.repository';

@Module({
  controllers: [CustomerController],
  providers: [CustomerService, { provide: CUSTOMER_REPOSITORY, useClass: CustomerDrizzleRepository }],
})
export class CustomersModule {}
