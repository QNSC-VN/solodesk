import { Module } from '@nestjs/common';
import { GhtkAdapter } from './ghtk.adapter';

@Module({
  providers: [GhtkAdapter],
  exports: [GhtkAdapter],
})
export class GhtkModule {}
