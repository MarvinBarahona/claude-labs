import { Module } from '@nestjs/common';
import { CachingLayerService } from './caching-layer.service';

@Module({
  providers: [CachingLayerService],
  exports: [CachingLayerService],
})
export class CachingLayerModule {}
