import { Module } from '@nestjs/common';
import { EnvelopeBuilderService } from './envelope-builder.service';

@Module({
  providers: [EnvelopeBuilderService],
  exports: [EnvelopeBuilderService],
})
export class EnvelopeBuilderModule {}
