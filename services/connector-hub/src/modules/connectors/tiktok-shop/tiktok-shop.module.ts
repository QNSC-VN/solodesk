import { Module } from '@nestjs/common';
import { TiktokShopAdapter } from './tiktok-shop.adapter';

@Module({
  providers: [TiktokShopAdapter],
  exports: [TiktokShopAdapter],
})
export class TiktokShopModule {}
