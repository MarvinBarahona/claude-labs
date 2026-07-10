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
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function buildModule() {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
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
});
