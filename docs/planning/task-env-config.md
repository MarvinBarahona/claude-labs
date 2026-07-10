# Task — Env/Config Loading

**Status:** In progress.

**Depends on:** [`project-scaffold.md`](../shared/project-scaffold.md) (needs the backend project scaffold to exist).

## Purpose

A single `.env`-backed config module (NestJS `ConfigModule` or equivalent) — the one place in the backend that reads environment variables and the one place every other module gets them from. Nothing else should call `process.env` directly.

## Interface

A typed config service exposing at least the following three variables:

- `ANTHROPIC_API_KEY` (required — throw a clear startup error if missing, rather than failing on the first API call).
- `GITHUB_TARGET_REPO` (optional, default `angular/angular` — chosen deliberately: since the app itself is built with Angular + NestJS, the default subject repo is one of the tools that built it).
- `GITHUB_TOKEN` (optional, no default).

`backend/.env.example` documents all three with placeholder values; real `.env` is git-ignored. Per `testing-strategy.md`, this "required" check only validates that `ANTHROPIC_API_KEY` is *set* — it never validates that it's a genuine working key, since that would need a real network call. That's what lets any keyless build or test context satisfy it with a placeholder string, never a real credential.

## Consumers

Every other backend module. Directly required by [`task-model-config.md`](task-model-config.md) (reads the API key) and [`task-github-provider.md`](task-github-provider.md) (reads the repo/token pair); every feature depends on it transitively through those.

## Potential other uses

Designed as a general typed-config service rather than three hardcoded getters, so any later addition (a per-feature flag, a default temperature, a docs base path) has one obvious home instead of a new ad hoc `process.env` read scattered somewhere.

## Build order & dependencies

Built right after [`project-scaffold.md`](../shared/project-scaffold.md), before any feature and before any other task (see `status.md` for current position). No dependency on anything else in the app.

## Test scenarios

- [ ] Starting the backend without `ANTHROPIC_API_KEY` set fails fast with a clear error, not a confusing downstream API failure.
- [ ] Starting the backend without `GITHUB_TARGET_REPO` set falls back to `angular/angular`.
- [ ] Starting the backend without `GITHUB_TOKEN` set works (it's fully optional) and downstream GitHub calls run unauthenticated.
- [ ] Setting all three variables in `.env` makes them readable through the config service, not through raw `process.env`.
- [ ] A placeholder (non-real) value for `ANTHROPIC_API_KEY` satisfies startup validation — confirming the check only requires the variable to be set, never that it's a genuine working key.

## To-do list

- [x] Write `backend/.env.example` with all three variables and placeholder values.
- [x] Add `.env` to `.gitignore` if not already covered.
- [x] Implement the config module/service (NestJS `ConfigModule` + a typed wrapper, or equivalent).
- [x] Add startup validation that fails fast when `ANTHROPIC_API_KEY` is missing.
- [x] Wire the `GITHUB_TARGET_REPO` default and optional `GITHUB_TOKEN`.

## Open questions

None.

## Development notes

- **[technical]** Implemented as `@nestjs/config`'s `ConfigModule` (added as a new dependency) wrapped in a project-local `AppConfigModule`/`AppConfigService` pair under `backend/src/config/`, rather than named plain `ConfigModule`/`ConfigService` — avoids a name collision with the `@nestjs/config` exports those files also import. `AppConfigModule` is `@Global()` and validates with a Zod schema (`config.schema.ts`) passed as `ConfigModule.forRoot({ validate })`, per `nest-conventions`. Any future work item adding a config value extends `envSchema` and adds a getter to `AppConfigService` — no other file should read `process.env` directly.
- **[technical]** Backend integration/e2e tests boot the real `AppModule`, which now fails fast without `ANTHROPIC_API_KEY`. Added `backend/test/setup-env.ts` (wired via `jest-e2e.json`'s `setupFiles`) that sets a placeholder `ANTHROPIC_API_KEY` for every e2e test run, consistent with `testing-strategy.md`'s "no test container ever holds a real credential" rule. This wasn't in the original to-do list — it surfaced only once the existing `app.e2e-spec.ts` broke against the new startup validation. Future work items adding backend integration tests get this placeholder for free; no per-test-file env setup needed for `ANTHROPIC_API_KEY`.
- All five test scenarios were verified both via automated tests (`config.schema.spec.ts`, `config.module.spec.ts`) and by hand: built `dist/` and ran the compiled app in a one-off container with (a) no env vars — fails fast with the clear Zod error and exit code 1, (b) only a placeholder `ANTHROPIC_API_KEY` — starts successfully, `GITHUB_TARGET_REPO` defaults to `angular/angular`, `GITHUB_TOKEN` stays `undefined`, (c) a real `backend/.env` copied from `.env.example` — all three values load from the file, not just inline env vars.
- The "downstream GitHub calls run unauthenticated" half of the `GITHUB_TOKEN` scenario is inherently untestable here — no GitHub client exists yet. `AppConfigService.githubToken` returning `undefined` when unset is verified; actually exercising unauthenticated GitHub calls is for `task-github-provider.md` to confirm when it consumes this value.
