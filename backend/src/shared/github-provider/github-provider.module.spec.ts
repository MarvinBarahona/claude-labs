import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppConfigService } from '../config/config.service';
import { FakeGithubClient } from '../../testing/github/fake-github-client';
import { GithubClient } from './github-client';
import { GithubProviderModule } from './github-provider.module';
import { RealGithubClient } from './real-github-client';

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

async function buildClient(fakeMode: boolean): Promise<GithubClient> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      stubConfigModule({
        fakeMode,
        githubTargetRepo: 'angular/angular',
        githubToken: undefined,
      }),
      GithubProviderModule,
    ],
  }).compile();

  return moduleRef.get(GithubClient);
}

describe('GithubProviderModule', () => {
  it('binds FakeGithubClient when fakeMode is true', async () => {
    const client = await buildClient(true);
    expect(client).toBeInstanceOf(FakeGithubClient);
  });

  it('binds RealGithubClient when fakeMode is false', async () => {
    const client = await buildClient(false);
    expect(client).toBeInstanceOf(RealGithubClient);
  });
});
