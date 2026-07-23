import { Module } from '@nestjs/common';
import { ModelConfigModule } from '../shared/model-config/model-config.module';
import { AnthropicClientModule } from '../shared/anthropic-client/anthropic-client.module';
import { EnvelopeBuilderModule } from '../shared/envelope-builder/envelope-builder.module';
import { DeepwikiConnectorModule } from '../shared/deepwiki-connector/deepwiki-connector.module';
import { WebRepoResearchReporterController } from './web-repo-research-reporter.controller';
import { WebRepoResearchReporterService } from './web-repo-research-reporter.service';

@Module({
  imports: [
    ModelConfigModule,
    AnthropicClientModule,
    EnvelopeBuilderModule,
    DeepwikiConnectorModule,
  ],
  controllers: [WebRepoResearchReporterController],
  providers: [WebRepoResearchReporterService],
})
export class WebRepoResearchReporterModule {}
