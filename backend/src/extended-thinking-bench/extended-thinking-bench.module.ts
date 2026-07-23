import { Module } from '@nestjs/common';
import { ModelConfigModule } from '../shared/model-config/model-config.module';
import { AnthropicClientModule } from '../shared/anthropic-client/anthropic-client.module';
import { EnvelopeBuilderModule } from '../shared/envelope-builder/envelope-builder.module';
import { GithubProviderModule } from '../shared/github-provider/github-provider.module';
import { ExtendedThinkingBenchController } from './extended-thinking-bench.controller';
import { ExtendedThinkingBenchService } from './extended-thinking-bench.service';

@Module({
  imports: [
    ModelConfigModule,
    AnthropicClientModule,
    EnvelopeBuilderModule,
    GithubProviderModule,
  ],
  controllers: [ExtendedThinkingBenchController],
  providers: [ExtendedThinkingBenchService],
})
export class ExtendedThinkingBenchModule {}
