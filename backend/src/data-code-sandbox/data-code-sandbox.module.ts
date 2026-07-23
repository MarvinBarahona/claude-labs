import { Module } from '@nestjs/common';
import { ModelConfigModule } from '../shared/model-config/model-config.module';
import { AnthropicClientModule } from '../shared/anthropic-client/anthropic-client.module';
import { EnvelopeBuilderModule } from '../shared/envelope-builder/envelope-builder.module';
import { GithubProviderModule } from '../shared/github-provider/github-provider.module';
import { DataCodeSandboxController } from './data-code-sandbox.controller';
import { DataCodeSandboxService } from './data-code-sandbox.service';

@Module({
  imports: [
    ModelConfigModule,
    AnthropicClientModule,
    EnvelopeBuilderModule,
    GithubProviderModule,
  ],
  controllers: [DataCodeSandboxController],
  providers: [DataCodeSandboxService],
})
export class DataCodeSandboxModule {}
