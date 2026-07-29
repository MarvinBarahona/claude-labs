// Placeholders so e2e tests booting the real AppModule never depend on a developer's own backend/.env.
process.env.ANTHROPIC_API_KEY ??= 'test-placeholder-anthropic-key';
process.env.FAKE_MODE ??= 'false';
