import { Module } from '@nestjs/common';
import { CatalogInventoryModule } from '../catalog-inventory/catalog-inventory.module';
import { ProcurementModule } from '../procurement/procurement.module';
import { TraceabilityService } from './application/traceability.service';
import { TraceController } from './api/trace.controller';
import { LotTraceDrizzleRepository } from './infrastructure/persistence/lot-trace.drizzle-repository';
import { LOT_TRACE_REPOSITORY } from './domain/ports/lot-trace.repository';

@Module({
  imports: [CatalogInventoryModule, ProcurementModule], // needs LOT_REPOSITORY/SKU_REPOSITORY + PURCHASE_NOTE_REPOSITORY (supplier-name enrichment)
  controllers: [TraceController],
  providers: [TraceabilityService, { provide: LOT_TRACE_REPOSITORY, useClass: LotTraceDrizzleRepository }],
  exports: [TraceabilityService],
})
export class TraceabilityModule {}
