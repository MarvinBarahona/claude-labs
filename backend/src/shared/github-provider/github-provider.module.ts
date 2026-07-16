import { Module } from '@nestjs/common';
import { fakeSwitchProvider } from '../fake-mode/fake-switch.provider';
import { FakeGithubClient } from '../../testing/github/fake-github-client';
import { GithubClient } from './github-client';
import { RealGithubClient } from './real-github-client';

@Module({
  providers: [
    fakeSwitchProvider<GithubClient>(GithubClient, {
      real: RealGithubClient,
      fake: FakeGithubClient,
    }),
  ],
  exports: [GithubClient],
})
export class GithubProviderModule {}
