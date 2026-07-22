import { Module } from '@nestjs/common';
import { StreamResponseBuilderService } from './stream-response-builder.service';

@Module({
  providers: [StreamResponseBuilderService],
  exports: [StreamResponseBuilderService],
})
export class StreamResponseBuilderModule {}
