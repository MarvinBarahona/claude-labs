import { Module } from '@nestjs/common';
import { ModelConfigModule } from '../shared/model-config/model-config.module';
import { AnthropicClientModule } from '../shared/anthropic-client/anthropic-client.module';
import { EnvelopeBuilderModule } from '../shared/envelope-builder/envelope-builder.module';
import { ContentBlockBuilderModule } from '../shared/content-block-builder/content-block-builder.module';
import { CachingLayerModule } from '../shared/caching-layer/caching-layer.module';
import { fakeSwitchProvider } from '../shared/fake-mode/fake-switch.provider';
import { FakeArxivClient } from '../testing/arxiv/fake-arxiv-client';
import { DocumentResearchAssistantController } from './document-research-assistant.controller';
import { DocumentResearchAssistantService } from './document-research-assistant.service';
import { ArxivClient } from './arxiv-client';
import { RealArxivClient } from './real-arxiv-client';

@Module({
  imports: [
    ModelConfigModule,
    AnthropicClientModule,
    EnvelopeBuilderModule,
    ContentBlockBuilderModule,
    CachingLayerModule,
  ],
  controllers: [DocumentResearchAssistantController],
  providers: [
    DocumentResearchAssistantService,
    // Generic pinned explicitly — RealArxivClient has private fields FakeArxivClient doesn't share.
    // Only this lab uses arXiv, so it's bound here directly rather than via its own provider module.
    fakeSwitchProvider<ArxivClient>(ArxivClient, {
      real: RealArxivClient,
      fake: FakeArxivClient,
    }),
  ],
})
export class DocumentResearchAssistantModule {}
