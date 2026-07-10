# Env/Config Loading

A single typed config service — the one place in the backend that reads environment variables. Nothing else should call `process.env` directly.

## Interface

`AppConfigModule` (`backend/src/config/config.module.ts`, `@Global()`) wraps `@nestjs/config`'s `ConfigModule`, validated at startup with a Zod schema (`config.schema.ts`) via `ConfigModule.forRoot({ validate })`. Consumers inject `AppConfigService` (`config.service.ts`) — the project-local wrapper, not `@nestjs/config`'s own `ConfigService` directly — to read:

- `anthropicApiKey` — required. A missing `ANTHROPIC_API_KEY` fails Nest's startup with a clear error, rather than failing on the first API call. The check only validates the variable is *set*, never that it's a genuine working key (see `testing-strategy.md`), which is what lets any keyless build or test context satisfy it with a placeholder string.
- `githubTargetRepo` — defaults to `angular/angular` if `GITHUB_TARGET_REPO` is unset.
- `githubToken` — `undefined` if `GITHUB_TOKEN` is unset; downstream GitHub calls run unauthenticated in that case.

`backend/.env.example` documents all three with placeholder values; real `.env` is git-ignored.

## Using it

Inject `AppConfigService` via Nest DI wherever a config value is needed — `AppConfigModule` is global, so no consumer module needs to import it explicitly. To add a new config value, extend `envSchema` in `config.schema.ts` and add a matching getter to `AppConfigService`; this is the one place a new environment variable should be added, rather than a new ad hoc `process.env` read elsewhere.

## Testing

Backend integration/e2e tests boot the real `AppModule`, which enforces the same startup validation. `backend/test/setup-env.ts` (wired via `jest-e2e.json`'s `setupFiles`) supplies a placeholder `ANTHROPIC_API_KEY` before every e2e run, so no individual test file needs its own env setup for this.
