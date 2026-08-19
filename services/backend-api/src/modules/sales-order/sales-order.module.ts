import { Module } from '@nestjs/common';
import { CatalogInventoryModule } from '../catalog-inventory/catalog-inventory.module';
import { OrderService } from './application/order.service';
import { OrderController } from './api/order.controller';
import { OrderDrizzleRepository } from './infrastructure/persistence/order.drizzle-repository';
import { ORDER_REPOSITORY } from './domain/ports/order.repository';

@Module({
  imports: [CatalogInventoryModule], // needs LOT_REPOSITORY/SKU_REPOSITORY — see OrderService
  controllers: [OrderController],
  providers: [OrderService, { provide: ORDER_REPOSITORY, useClass: OrderDrizzleRepository }],
  // ORDER_REPOSITORY exported too: returns needs IOrderRepository directly
  // (not through OrderService) so it can pass its own transaction through —
  // same repository-to-repository composition as OrderService itself does
  // with LOT_REPOSITORY/SKU_REPOSITORY.
  exports: [OrderService, ORDER_REPOSITORY],
})
export class SalesOrderModule {}
