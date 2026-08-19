import { Module } from '@nestjs/common';
import { CatalogService } from './application/catalog.service';
import { InventoryService } from './application/inventory.service';
import { SkuController } from './api/sku.controller';
import { LotController } from './api/lot.controller';
import { SkuDrizzleRepository } from './infrastructure/persistence/sku.drizzle-repository';
import { LotDrizzleRepository } from './infrastructure/persistence/lot.drizzle-repository';
import { SKU_REPOSITORY } from './domain/ports/sku.repository';
import { LOT_REPOSITORY } from './domain/ports/lot.repository';

@Module({
  controllers: [SkuController, LotController],
  providers: [
    CatalogService,
    InventoryService,
    { provide: SKU_REPOSITORY, useClass: SkuDrizzleRepository },
    { provide: LOT_REPOSITORY, useClass: LotDrizzleRepository },
  ],
  exports: [CatalogService, InventoryService],
})
export class CatalogInventoryModule {}
