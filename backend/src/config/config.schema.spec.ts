import { validateEnv } from './config.schema';

describe('validateEnv', () => {
  it('throws a clear error when ANTHROPIC_API_KEY is missing', () => {
    expect(() => validateEnv({})).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('accepts a placeholder ANTHROPIC_API_KEY without validating it is a genuine key', () => {
    const config = validateEnv({ ANTHROPIC_API_KEY: 'placeholder' });
    expect(config.ANTHROPIC_API_KEY).toBe('placeholder');
  });

  it('defaults GITHUB_TARGET_REPO to angular/angular when unset', () => {
    const config = validateEnv({ ANTHROPIC_API_KEY: 'placeholder' });
    expect(config.GITHUB_TARGET_REPO).toBe('angular/angular');
  });

  it('leaves GITHUB_TOKEN undefined when unset', () => {
    const config = validateEnv({ ANTHROPIC_API_KEY: 'placeholder' });
    expect(config.GITHUB_TOKEN).toBeUndefined();
  });

  it('passes through explicit values for all three variables', () => {
    const config = validateEnv({
      ANTHROPIC_API_KEY: 'placeholder',
      GITHUB_TARGET_REPO: 'nestjs/nest',
      GITHUB_TOKEN: 'ghp_placeholder',
    });

    expect(config).toEqual({
      ANTHROPIC_API_KEY: 'placeholder',
      GITHUB_TARGET_REPO: 'nestjs/nest',
      GITHUB_TOKEN: 'ghp_placeholder',
    });
  });
});
