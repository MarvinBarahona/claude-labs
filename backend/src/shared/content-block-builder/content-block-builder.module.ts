import { Module } from '@nestjs/common';
import { AnthropicClientModule } from '../anthropic-client/anthropic-client.module';
import { ContentBlockBuilderService } from './content-block-builder.service';

@Module({
  imports: [AnthropicClientModule],
  providers: [ContentBlockBuilderService],
  exports: [ContentBlockBuilderService],
})
export class ContentBlockBuilderModule {}
