import { Module } from '@nestjs/common';
import { LazadaAdapter } from './lazada.adapter';

@Module({
  providers: [LazadaAdapter],
  exports: [LazadaAdapter],
})
export class LazadaModule {}
