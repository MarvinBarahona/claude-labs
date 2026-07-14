import { Module } from '@nestjs/common';
import { ModeController } from './mode.controller';
import { KeyHealthModule } from '../key-health/key-health.module';

@Module({
  imports: [KeyHealthModule],
  controllers: [ModeController],
})
export class FakeModeModule {}
