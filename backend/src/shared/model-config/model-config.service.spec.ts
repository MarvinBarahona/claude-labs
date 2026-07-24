import { Test } from '@nestjs/testing';
import { AppConfigService } from '../config/config.service';
import { ModelConfigService } from './model-config.service';

describe('ModelConfigService', () => {
  const configStub: Partial<AppConfigService> = {
    modelDefault: 'claude-sonnet-5',
    modelClassification: 'claude-haiku-4-5',
    modelHardestCall: 'claude-opus-4-8',
  };

  async function buildService(): Promise<ModelConfigService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ModelConfigService,
        { provide: AppConfigService, useValue: configStub },
      ],
    }).compile();

    return moduleRef.get(ModelConfigService);
  }

  it('returns Sonnet for the default tier', async () => {
    const service = await buildService();
    expect(service.getModel('default')).toBe('claude-sonnet-5');
  });

  it('returns Haiku for the classification tier', async () => {
    const service = await buildService();
    expect(service.getModel('classification')).toBe('claude-haiku-4-5');
  });

  it('returns Opus for the hardest-call tier', async () => {
    const service = await buildService();
    expect(service.getModel('hardest-call')).toBe('claude-opus-4-8');
  });

  it('returns the shared default max_tokens', async () => {
    const service = await buildService();
    expect(service.getDefaultMaxTokens()).toBe(4096);
  });

  it('reflects a changed tier mapping without any per-consumer edit', async () => {
    const overriddenConfig: Partial<AppConfigService> = {
      ...configStub,
      modelDefault: 'claude-sonnet-5-override',
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ModelConfigService,
        { provide: AppConfigService, useValue: overriddenConfig },
      ],
    }).compile();
    const service = moduleRef.get(ModelConfigService);

    expect(service.getModel('default')).toBe('claude-sonnet-5-override');
  });
});
