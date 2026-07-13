import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config.schema';
import { AppConfigService } from './config.service';

describe('AppConfigModule wiring', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GITHUB_TARGET_REPO;
    delete process.env.GITHUB_TOKEN;
    delete process.env.MODEL_DEFAULT;
    delete process.env.MODEL_CLASSIFICATION;
    delete process.env.MODEL_HARDEST_CALL;
    delete process.env.THINKING_EFFORT_DEFAULT;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function buildModule() {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validate: validateEnv,
        }),
      ],
      providers: [AppConfigService],
    }).compile();
  }

  it('fails fast at startup when ANTHROPIC_API_KEY is missing', async () => {
    await expect(buildModule()).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it('falls back to the default GITHUB_TARGET_REPO and leaves GITHUB_TOKEN optional', async () => {
    process.env.ANTHROPIC_API_KEY = 'placeholder';

    const moduleRef = await buildModule();
    const config = moduleRef.get(AppConfigService);

    expect(config.anthropicApiKey).toBe('placeholder');
    expect(config.githubTargetRepo).toBe('angular/angular');
    expect(config.githubToken).toBeUndefined();
  });

  it('reads all three variables through AppConfigService, not raw process.env', async () => {
    process.env.ANTHROPIC_API_KEY = 'placeholder';
    process.env.GITHUB_TARGET_REPO = 'nestjs/nest';
    process.env.GITHUB_TOKEN = 'ghp_placeholder';

    const moduleRef = await buildModule();
    const config = moduleRef.get(AppConfigService);

    expect(config.anthropicApiKey).toBe('placeholder');
    expect(config.githubTargetRepo).toBe('nestjs/nest');
    expect(config.githubToken).toBe('ghp_placeholder');
  });

  it('falls back to the default model tier mapping and thinking effort when unset', async () => {
    process.env.ANTHROPIC_API_KEY = 'placeholder';

    const moduleRef = await buildModule();
    const config = moduleRef.get(AppConfigService);

    expect(config.modelDefault).toBe('claude-sonnet-5');
    expect(config.modelClassification).toBe('claude-haiku-4-5');
    expect(config.modelHardestCall).toBe('claude-opus-4-8');
    expect(config.thinkingEffortDefault).toBe('medium');
  });

  it('reads the model tier mapping and thinking effort through AppConfigService when overridden', async () => {
    process.env.ANTHROPIC_API_KEY = 'placeholder';
    process.env.MODEL_DEFAULT = 'claude-sonnet-5-override';
    process.env.MODEL_CLASSIFICATION = 'claude-haiku-4-5-override';
    process.env.MODEL_HARDEST_CALL = 'claude-opus-4-8-override';
    process.env.THINKING_EFFORT_DEFAULT = 'high';

    const moduleRef = await buildModule();
    const config = moduleRef.get(AppConfigService);

    expect(config.modelDefault).toBe('claude-sonnet-5-override');
    expect(config.modelClassification).toBe('claude-haiku-4-5-override');
    expect(config.modelHardestCall).toBe('claude-opus-4-8-override');
    expect(config.thinkingEffortDefault).toBe('high');
  });
});
