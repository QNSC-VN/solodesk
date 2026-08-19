import { Module } from '@nestjs/common';
import { GhnAdapter } from './ghn.adapter';

@Module({
  providers: [GhnAdapter],
  exports: [GhnAdapter],
})
export class GhnModule {}
