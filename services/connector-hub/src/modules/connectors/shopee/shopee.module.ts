import { Module } from '@nestjs/common';
import { ShopeeAdapter } from './shopee.adapter';

@Module({
  providers: [ShopeeAdapter],
  exports: [ShopeeAdapter],
})
export class ShopeeModule {}
