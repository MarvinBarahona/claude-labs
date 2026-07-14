import { Test } from '@nestjs/testing';
import { AppConfigService } from '../config/config.service';
import { KeyHealthService } from '../key-health/key-health.service';
import { ModeController } from './mode.controller';

async function buildController(
  configStub: Partial<AppConfigService>,
  keyHealthStub: Partial<KeyHealthService> = {},
): Promise<ModeController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ModeController],
    providers: [
      { provide: AppConfigService, useValue: configStub },
      { provide: KeyHealthService, useValue: keyHealthStub },
    ],
  }).compile();

  return moduleRef.get(ModeController);
}

describe('ModeController', () => {
  it('reports fakeMode: false and omits repoUrl when fake mode is off', async () => {
    const controller = await buildController(
      { fakeMode: false, repoUrl: undefined },
      { getKeyStatus: () => Promise.resolve('valid') },
    );
    await expect(controller.getMode()).resolves.toEqual({
      fakeMode: false,
      keyStatus: 'valid',
    });
  });

  it('reports fakeMode: true and omits repoUrl when REPO_URL is unset', async () => {
    const controller = await buildController({
      fakeMode: true,
      repoUrl: undefined,
    });
    await expect(controller.getMode()).resolves.toEqual({ fakeMode: true });
  });

  it('includes repoUrl when set', async () => {
    const controller = await buildController({
      fakeMode: true,
      repoUrl: 'https://github.com/example/claude-labs',
    });
    await expect(controller.getMode()).resolves.toEqual({
      fakeMode: true,
      repoUrl: 'https://github.com/example/claude-labs',
    });
  });

  it('includes keyStatus: "invalid" when the key health check reports an invalid key', async () => {
    const controller = await buildController(
      { fakeMode: false, repoUrl: undefined },
      { getKeyStatus: () => Promise.resolve('invalid') },
    );
    await expect(controller.getMode()).resolves.toEqual({
      fakeMode: false,
      keyStatus: 'invalid',
    });
  });

  it('omits keyStatus entirely when fake mode is on, without consulting the key health check', async () => {
    const getKeyStatus = jest.fn();
    const controller = await buildController(
      { fakeMode: true, repoUrl: undefined },
      { getKeyStatus },
    );
    await expect(controller.getMode()).resolves.toEqual({ fakeMode: true });
    expect(getKeyStatus).not.toHaveBeenCalled();
  });
});
