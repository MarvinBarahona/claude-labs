import { Module } from '@nestjs/common';
import { ModelConfigService } from './model-config.service';

@Module({
  providers: [ModelConfigService],
  exports: [ModelConfigService],
})
export class ModelConfigModule {}
