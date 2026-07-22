import { Module } from '@nestjs/common';
import { ModelConfigModule } from '../shared/model-config/model-config.module';
import { AnthropicClientModule } from '../shared/anthropic-client/anthropic-client.module';
import { EnvelopeBuilderModule } from '../shared/envelope-builder/envelope-builder.module';
import { StreamResponseBuilderModule } from '../shared/stream-response-builder/stream-response-builder.module';
import { GithubProviderModule } from '../shared/github-provider/github-provider.module';
import { fakeSwitchProvider } from '../shared/fake-mode/fake-switch.provider';
import { FakeOpenMeteoClient } from '../testing/open-meteo/fake-open-meteo-client';
import { LiveToolUseConsoleController } from './live-tool-use-console.controller';
import { LiveToolUseConsoleService } from './live-tool-use-console.service';
import { OpenMeteoClient } from './open-meteo-client';
import { RealOpenMeteoClient } from './real-open-meteo-client';

@Module({
  imports: [
    ModelConfigModule,
    AnthropicClientModule,
    EnvelopeBuilderModule,
    StreamResponseBuilderModule,
    GithubProviderModule,
  ],
  controllers: [LiveToolUseConsoleController],
  providers: [
    LiveToolUseConsoleService,
    // Generic pinned explicitly since only this lab uses Open-Meteo — RealOpenMeteoClient has private fields FakeOpenMeteoClient doesn't share.
    fakeSwitchProvider<OpenMeteoClient>(OpenMeteoClient, {
      real: RealOpenMeteoClient,
      fake: FakeOpenMeteoClient,
    }),
  ],
})
export class LiveToolUseConsoleModule {}
