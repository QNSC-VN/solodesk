import { Module } from '@nestjs/common';
import { CatalogInventoryModule } from '../catalog-inventory/catalog-inventory.module';
import { SupplierService } from './application/supplier.service';
import { NegotiatedPriceService } from './application/negotiated-price.service';
import { PurchaseNoteService } from './application/purchase-note.service';
import { SupplierController } from './api/supplier.controller';
import { NegotiatedPriceController } from './api/negotiated-price.controller';
import { PurchaseNoteController } from './api/purchase-note.controller';
import { SupplierDrizzleRepository } from './infrastructure/persistence/supplier.drizzle-repository';
import { NegotiatedPriceDrizzleRepository } from './infrastructure/persistence/negotiated-price.drizzle-repository';
import { PurchaseNoteDrizzleRepository } from './infrastructure/persistence/purchase-note.drizzle-repository';
import { SUPPLIER_REPOSITORY } from './domain/ports/supplier.repository';
import { NEGOTIATED_PRICE_REPOSITORY } from './domain/ports/negotiated-price.repository';
import { PURCHASE_NOTE_REPOSITORY } from './domain/ports/purchase-note.repository';

@Module({
  imports: [CatalogInventoryModule], // needs LOT_REPOSITORY/SKU_REPOSITORY (receive stock) + CatalogService (SKU 404 check)
  controllers: [SupplierController, NegotiatedPriceController, PurchaseNoteController],
  providers: [
    SupplierService,
    NegotiatedPriceService,
    PurchaseNoteService,
    { provide: SUPPLIER_REPOSITORY, useClass: SupplierDrizzleRepository },
    { provide: NEGOTIATED_PRICE_REPOSITORY, useClass: NegotiatedPriceDrizzleRepository },
    { provide: PURCHASE_NOTE_REPOSITORY, useClass: PurchaseNoteDrizzleRepository },
  ],
  exports: [SupplierService, NegotiatedPriceService, PurchaseNoteService],
})
export class ProcurementModule {}
