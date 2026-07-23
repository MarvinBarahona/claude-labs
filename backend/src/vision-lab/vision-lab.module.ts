import { Module } from '@nestjs/common';
import { ModelConfigModule } from '../shared/model-config/model-config.module';
import { AnthropicClientModule } from '../shared/anthropic-client/anthropic-client.module';
import { EnvelopeBuilderModule } from '../shared/envelope-builder/envelope-builder.module';
import { StreamResponseBuilderModule } from '../shared/stream-response-builder/stream-response-builder.module';
import { ContentBlockBuilderModule } from '../shared/content-block-builder/content-block-builder.module';
import { fakeSwitchProvider } from '../shared/fake-mode/fake-switch.provider';
import { FakeWikimediaClient } from '../testing/wikimedia/fake-wikimedia-client';
import { VisionLabController } from './vision-lab.controller';
import { VisionLabService } from './vision-lab.service';
import { WikimediaClient } from './wikimedia-client';
import { RealWikimediaClient } from './real-wikimedia-client';

@Module({
  imports: [
    ModelConfigModule,
    AnthropicClientModule,
    EnvelopeBuilderModule,
    StreamResponseBuilderModule,
    ContentBlockBuilderModule,
  ],
  controllers: [VisionLabController],
  providers: [
    VisionLabService,
    // Generic pinned explicitly since only this lab uses Wikimedia — RealWikimediaClient has private fields FakeWikimediaClient doesn't share.
    fakeSwitchProvider<WikimediaClient>(WikimediaClient, {
      real: RealWikimediaClient,
      fake: FakeWikimediaClient,
    }),
  ],
})
export class VisionLabModule {}
