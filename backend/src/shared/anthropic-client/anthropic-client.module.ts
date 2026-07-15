import { Module } from '@nestjs/common';
import { fakeSwitchProvider } from '../fake-mode/fake-switch.provider';
import { AnthropicClient } from './anthropic-client';
import { RealAnthropicClient } from './real-anthropic-client';
import { FakeAnthropicClient } from '../../testing/anthropic/fake-anthropic-client';

@Module({
  providers: [
    fakeSwitchProvider<AnthropicClient>(AnthropicClient, {
      real: RealAnthropicClient,
      fake: FakeAnthropicClient,
    }),
  ],
  exports: [AnthropicClient],
})
export class AnthropicClientModule {}
