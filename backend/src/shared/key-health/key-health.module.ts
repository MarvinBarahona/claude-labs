import { Module } from '@nestjs/common';
import { KeyHealthService } from './key-health.service';

@Module({
  providers: [KeyHealthService],
  exports: [KeyHealthService],
})
export class KeyHealthModule {}
