// Backend integration tests boot the real AppModule, which fails fast without
// ANTHROPIC_API_KEY. Per testing-strategy.md, no test container ever holds a
// real credential, so this placeholder satisfies startup validation only.
process.env.ANTHROPIC_API_KEY ??= 'test-placeholder-anthropic-key';
