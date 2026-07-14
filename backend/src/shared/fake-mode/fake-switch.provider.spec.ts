import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppConfigService } from '../config/config.service';
import { fakeSwitchProvider } from './fake-switch.provider';

abstract class Greeter {
  abstract greet(): string;
}

@Injectable()
class RealGreeter extends Greeter {
  constructor(private readonly config: AppConfigService) {
    super();
  }

  greet(): string {
    return `real:${this.config.repoUrl}`;
  }
}

@Injectable()
class FakeGreeter extends Greeter {
  greet(): string {
    return 'fake';
  }
}

async function buildModule(fakeMode: boolean) {
  const configStub: Partial<AppConfigService> = {
    fakeMode,
    repoUrl: 'stub-repo',
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: AppConfigService, useValue: configStub },
      fakeSwitchProvider(Greeter, { real: RealGreeter, fake: FakeGreeter }),
    ],
  }).compile();
  return moduleRef.get(Greeter);
}

describe('fakeSwitchProvider', () => {
  it('binds the real implementation, with its own constructor deps resolved via DI, when fakeMode is false', async () => {
    const greeter = await buildModule(false);
    expect(greeter.greet()).toBe('real:stub-repo');
  });

  it('binds the fake implementation when fakeMode is true', async () => {
    const greeter = await buildModule(true);
    expect(greeter.greet()).toBe('fake');
  });
});
