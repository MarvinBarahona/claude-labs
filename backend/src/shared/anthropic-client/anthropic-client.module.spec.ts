import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppConfigService } from '../config/config.service';
import { FakeAnthropicClient } from '../../testing/anthropic/fake-anthropic-client';
import { AnthropicClient } from './anthropic-client';
import { AnthropicClientModule } from './anthropic-client.module';
import { RealAnthropicClient } from './real-anthropic-client';

// Stands in for the real, @Global() AppConfigModule so this test never loads
// the real backend/.env — no test ever holds a real credential.
function stubConfigModule(configStub: Partial<AppConfigService>) {
  @Global()
  @Module({
    providers: [{ provide: AppConfigService, useValue: configStub }],
    exports: [AppConfigService],
  })
  class StubConfigModule {}
  return StubConfigModule;
}

async function buildClient(fakeMode: boolean): Promise<AnthropicClient> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      stubConfigModule({ fakeMode, anthropicApiKey: 'test-key' }),
      AnthropicClientModule,
    ],
  }).compile();

  return moduleRef.get(AnthropicClient);
}

describe('AnthropicClientModule', () => {
  it('binds FakeAnthropicClient when fakeMode is true', async () => {
    const client = await buildClient(true);
    expect(client).toBeInstanceOf(FakeAnthropicClient);
  });

  it('binds RealAnthropicClient when fakeMode is false', async () => {
    const client = await buildClient(false);
    expect(client).toBeInstanceOf(RealAnthropicClient);
  });
});
