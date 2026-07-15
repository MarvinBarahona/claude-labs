import { Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppConfigService } from '../config/config.service';
import { AnthropicClient } from './anthropic-client';
import { RealAnthropicClient } from './real-anthropic-client';
import { FakeAnthropicClient } from '../../testing/anthropic/fake-anthropic-client';

/** Not the shared `fakeSwitchProvider()` — the live-app fake instance also needs `allowUnqueuedFallback` enabled; see docs/shared/test-doubles.md. */
@Module({
  providers: [
    {
      provide: AnthropicClient,
      useFactory: async (config: AppConfigService, moduleRef: ModuleRef) => {
        if (!config.fakeMode) {
          return moduleRef.create(RealAnthropicClient);
        }
        const fake = await moduleRef.create(FakeAnthropicClient);
        fake.allowUnqueuedFallback = true;
        return fake;
      },
      inject: [AppConfigService, ModuleRef],
    },
  ],
  exports: [AnthropicClient],
})
export class AnthropicClientModule {}
