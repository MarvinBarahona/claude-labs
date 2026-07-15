// Placeholders so e2e tests booting the real AppModule never depend on a
// developer's own backend/.env — no test container ever holds a real
// credential, per testing-strategy.md.
process.env.ANTHROPIC_API_KEY ??= 'test-placeholder-anthropic-key';
process.env.FAKE_MODE ??= 'false';
