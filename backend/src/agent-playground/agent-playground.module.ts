import { Module } from '@nestjs/common';
import { ModelConfigModule } from '../shared/model-config/model-config.module';
import { AnthropicClientModule } from '../shared/anthropic-client/anthropic-client.module';
import { EnvelopeBuilderModule } from '../shared/envelope-builder/envelope-builder.module';
import { StreamResponseBuilderModule } from '../shared/stream-response-builder/stream-response-builder.module';
import { GithubProviderModule } from '../shared/github-provider/github-provider.module';
import { DeepwikiConnectorModule } from '../shared/deepwiki-connector/deepwiki-connector.module';
import { AgentPlaygroundController } from './agent-playground.controller';
import { AgentPlaygroundService } from './agent-playground.service';

@Module({
  imports: [
    ModelConfigModule,
    AnthropicClientModule,
    EnvelopeBuilderModule,
    StreamResponseBuilderModule,
    GithubProviderModule,
    DeepwikiConnectorModule,
  ],
  controllers: [AgentPlaygroundController],
  providers: [AgentPlaygroundService],
})
export class AgentPlaygroundModule {}
