import { Module } from '@nestjs/common';
import { ModeController } from './mode.controller';

@Module({
  controllers: [ModeController],
})
export class FakeModeModule {}
