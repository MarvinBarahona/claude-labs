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

  it('defaults the model tier mapping and thinking effort when unset', () => {
    const config = validateEnv({ ANTHROPIC_API_KEY: 'placeholder' });
    expect(config.MODEL_DEFAULT).toBe('claude-sonnet-5');
    expect(config.MODEL_CLASSIFICATION).toBe('claude-haiku-4-5');
    expect(config.MODEL_HARDEST_CALL).toBe('claude-opus-4-8');
    expect(config.THINKING_EFFORT_DEFAULT).toBe('medium');
  });

  it('rejects an invalid THINKING_EFFORT_DEFAULT', () => {
    expect(() =>
      validateEnv({
        ANTHROPIC_API_KEY: 'placeholder',
        THINKING_EFFORT_DEFAULT: 'extreme',
      }),
    ).toThrow(/THINKING_EFFORT_DEFAULT/);
  });

  it('passes through explicit values for all variables', () => {
    const config = validateEnv({
      ANTHROPIC_API_KEY: 'placeholder',
      GITHUB_TARGET_REPO: 'nestjs/nest',
      GITHUB_TOKEN: 'ghp_placeholder',
      MODEL_DEFAULT: 'claude-sonnet-5-override',
      MODEL_CLASSIFICATION: 'claude-haiku-4-5-override',
      MODEL_HARDEST_CALL: 'claude-opus-4-8-override',
      THINKING_EFFORT_DEFAULT: 'high',
    });

    expect(config).toEqual({
      ANTHROPIC_API_KEY: 'placeholder',
      GITHUB_TARGET_REPO: 'nestjs/nest',
      GITHUB_TOKEN: 'ghp_placeholder',
      MODEL_DEFAULT: 'claude-sonnet-5-override',
      MODEL_CLASSIFICATION: 'claude-haiku-4-5-override',
      MODEL_HARDEST_CALL: 'claude-opus-4-8-override',
      THINKING_EFFORT_DEFAULT: 'high',
    });
  });
});
