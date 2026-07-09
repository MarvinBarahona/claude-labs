# Task — Env/Config Loading

**Status:** Draft.

**Depends on:** [`task-project-scaffold.md`](task-project-scaffold.md) (needs the backend project scaffold to exist).

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

Built right after [`task-project-scaffold.md`](task-project-scaffold.md), before any feature and before any other task (see `status.md` for current position). No dependency on anything else in the app.

## Test scenarios

- [ ] Starting the backend without `ANTHROPIC_API_KEY` set fails fast with a clear error, not a confusing downstream API failure.
- [ ] Starting the backend without `GITHUB_TARGET_REPO` set falls back to `angular/angular`.
- [ ] Starting the backend without `GITHUB_TOKEN` set works (it's fully optional) and downstream GitHub calls run unauthenticated.
- [ ] Setting all three variables in `.env` makes them readable through the config service, not through raw `process.env`.
- [ ] A placeholder (non-real) value for `ANTHROPIC_API_KEY` satisfies startup validation — confirming the check only requires the variable to be set, never that it's a genuine working key.

## To-do list

- [ ] Write `backend/.env.example` with all three variables and placeholder values.
- [ ] Add `.env` to `.gitignore` if not already covered.
- [ ] Implement the config module/service (NestJS `ConfigModule` + a typed wrapper, or equivalent).
- [ ] Add startup validation that fails fast when `ANTHROPIC_API_KEY` is missing.
- [ ] Wire the `GITHUB_TARGET_REPO` default and optional `GITHUB_TOKEN`.

## Open questions

None.
