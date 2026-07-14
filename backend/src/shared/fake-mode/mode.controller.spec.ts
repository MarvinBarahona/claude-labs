import { Test } from '@nestjs/testing';
import { AppConfigService } from '../config/config.service';
import { ModeController } from './mode.controller';

async function buildController(
  configStub: Partial<AppConfigService>,
): Promise<ModeController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ModeController],
    providers: [{ provide: AppConfigService, useValue: configStub }],
  }).compile();

  return moduleRef.get(ModeController);
}

describe('ModeController', () => {
  it('reports fakeMode: false and omits repoUrl when fake mode is off', async () => {
    const controller = await buildController({
      fakeMode: false,
      repoUrl: undefined,
    });
    expect(controller.getMode()).toEqual({ fakeMode: false });
  });

  it('reports fakeMode: true and omits repoUrl when REPO_URL is unset', async () => {
    const controller = await buildController({
      fakeMode: true,
      repoUrl: undefined,
    });
    expect(controller.getMode()).toEqual({ fakeMode: true });
  });

  it('includes repoUrl when set', async () => {
    const controller = await buildController({
      fakeMode: true,
      repoUrl: 'https://github.com/example/claude-labs',
    });
    expect(controller.getMode()).toEqual({
      fakeMode: true,
      repoUrl: 'https://github.com/example/claude-labs',
    });
  });
});
