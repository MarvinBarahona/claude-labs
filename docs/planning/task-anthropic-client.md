# Task — Anthropic client

**Status:** 📋 Planned.

## Description

A real backend adapter over the Anthropic SDK (`@anthropic-ai/sdk`), wired to the same `AnthropicClient` DI token the fake implementation already uses, so any feature that calls the Messages API for real can inject `AnthropicClient` and get the real client in real mode / the fake in fake mode with no per-feature branching.

Needed because no real implementation exists yet — the `AnthropicClient` abstract class (the DI token) currently lives at `backend/src/testing/anthropic/anthropic-client.ts`, a folder `tsconfig.build.json` excludes from the compiled build entirely. That's fine while only test code references the token, but the moment a production module needs to bind a real class to it (`fakeSwitchProvider(AnthropicClient, { real: RealAnthropicClient, fake: FakeAnthropicClient })`), the token itself must live somewhere the production build actually includes — it can't be defined inside the excluded `testing/` folder.

This surfaced while planning `feature-foundations-console.md`, whose model picker/streaming demo is the first feature to call the Messages API for real; that plan assumed this adapter already existed. Every later feature that calls Claude for real also depends on this, not just that one — it belongs as its own shared task rather than bundled into Foundations Console's scope.

## Mode matrix this task must satisfy

The app always runs as exactly one of four combinations of `FAKE_MODE` × credential validity, in either the dev or prod Compose stack — this task is what makes `FAKE_MODE` actually govern which `AnthropicClient` implementation a real feature gets, in every combination:

| `FAKE_MODE` | `ANTHROPIC_API_KEY` | Dev | Prod | What runs |
|---|---|---|---|---|
| `true` | irrelevant (never read for a real call) | Daily dev use — by a human or the coding agent | The only mode this project is ever deployed publicly in (a real key must never be present in a deployed instance) | `FakeAnthropicClient` always, regardless of what the key string even is |
| `false` | invalid/missing-but-set | Same failure mode as prod | Same failure mode as dev | `RealAnthropicClient` is still bound and still attempts real calls; `key-health.md`'s existing banner already surfaces the bad key proactively, and any feature's own real call fails via `task-api-error-handling`'s normalized error shape — no extra enforcement needed beyond those two already-covered pieces |
| `false` | valid | Manual, human-only feature testing once a feature exists | The actual target: a person running the app locally for real, against their own key | `RealAnthropicClient` makes real calls successfully |

This task's own automated tests only ever exercise the top row and the nock-intercepted half of the middle/bottom rows (see Test scenarios) — never a real key, per `testing-strategy.md`'s "No container that runs tests ever holds a real credential". The bottom-right cell (valid key, either Compose stack) is the one combination no automated test or the coding agent itself ever drives; it's confirmed only by the user, manually, with their own key.

## Guiding principles / standing decisions cited

- [`fake-mode.md`](../shared/fake-mode.md), "Interface" (`fakeSwitchProvider()`) and "Using it" — the DI-switch mechanism this task's module wires `AnthropicClient` through; already proven generically in `fake-switch.provider.spec.ts`, so this task only needs to bind the two real classes to it, not re-test the switch itself.
- [`env-config.md`](../shared/env-config.md), "Interface" (`anthropicApiKey`) — what `RealAnthropicClient` constructs the SDK client from; already validated at startup as "set" only, never "valid" (see `key-health.md` for the separate check that actually confirms validity).
- [`testing-strategy.md`](../technical/testing-strategy.md), "No container that runs tests ever holds a real credential" and "Every external client sits behind a mockable seam" — governs every test scenario below.
- [`test-doubles.md`](../shared/test-doubles.md) — current home of `AnthropicClient`'s token/types and `FakeAnthropicClient`; this task relocates only the token/types (not the fake) to a build-included shared location, and updates this doc to match once built.
- [`repo-layout.md`](../technical/repo-layout.md), "Shared functionality" — new module folder is `backend/src/shared/anthropic-client/`, sibling to `model-config`/`fake-mode`/`key-health`, matching the existing shared-module layout convention.
- [`tech-stack.md`](../technical/tech-stack.md), "Runtime" and `README.md`'s "Production" section — both already confirm dev and prod read `backend/.env` (`FAKE_MODE`, `ANTHROPIC_API_KEY`) identically; nothing Compose- or environment-specific needs building for the matrix above, only the DI wiring itself.

## Depends on

- [`api-error-handling.md`](../shared/api-error-handling.md) — its normalized "external call failed" exception class, `ExternalApiError`, is what `RealAnthropicClient` throws when a real Anthropic call fails (bad key, rate limit, etc.), instead of letting the raw SDK error propagate unshaped.

## Contract

- **`backend/src/shared/anthropic-client/anthropic-client.ts`** — relocated from `backend/src/testing/anthropic/anthropic-client.ts`: the `AnthropicClient` abstract class (DI token) and its `AnthropicMessage`/`AnthropicMessageParams`/`AnthropicStreamEvent` type aliases, unchanged in shape — only the file's location changes, so nothing that already depends on the token's *type* needs to change, only its import path.
- **`backend/src/testing/anthropic/fake-anthropic-client.ts`** — `FakeAnthropicClient` stays exactly where it is (test-only code stays under `testing/`, per `repo-layout.md`), now importing `AnthropicClient` and its types from the new shared location instead of defining them itself.
- **`backend/src/shared/anthropic-client/real-anthropic-client.ts`** (new) — `RealAnthropicClient implements AnthropicClient`: constructs `new Anthropic({ apiKey: this.config.anthropicApiKey })` (via `AppConfigService`, no `maxRetries` override — unlike `key-health.md`'s deliberately-fast `maxRetries: 0` check, a real user-facing call should get the SDK's normal retry behavior). `createMessage()` calls `client.messages.create(params)` directly. `streamMessage()` calls `client.messages.stream(params)` (or `create({ ...params, stream: true })`) and yields the SDK's own raw stream events, unmodified, as the `AsyncIterable<AnthropicStreamEvent>` the token's type already commits to. Any thrown Anthropic SDK error (auth failure, rate limit, network error, etc.) is caught and rethrown as [`api-error-handling.md`](../shared/api-error-handling.md)'s `ExternalApiError` (`backend/src/shared/api-error-handling`), `source: 'anthropic'`.
- **`backend/src/shared/anthropic-client/anthropic-client.module.ts`** (new) — `providers: [fakeSwitchProvider(AnthropicClient, { real: RealAnthropicClient, fake: FakeAnthropicClient })]`, `exports: [AnthropicClient]`. A consuming feature module (e.g. Foundations Console) imports this module and injects `AnthropicClient` — never `RealAnthropicClient`/`FakeAnthropicClient` directly.

No frontend surface and no independent implementation tracks — this is a single backend-only track.

## Test scenarios

All backend; none uses a real credential (placeholder `ANTHROPIC_API_KEY` throughout, per `testing-strategy.md`).

Unit (`real-anthropic-client.spec.ts`, `anthropic-client.module.spec.ts`):
- `RealAnthropicClient` constructs its underlying SDK client from `AppConfigService.anthropicApiKey`.
- A thrown Anthropic SDK error from `createMessage()`/`streamMessage()` is caught and rethrown as `task-api-error-handling`'s normalized exception with `source: 'anthropic'`, preserving the original message.
- `AnthropicClientModule` binds `FakeAnthropicClient` when `AppConfigService.fakeMode` is `true` and `RealAnthropicClient` when `false` (mirrors the existing generic `fake-switch.provider.spec.ts` coverage, scoped to this specific token).

Integration (`nock`-intercepted, real client code actually running):
- Non-streaming success: existing `mockAnthropicMessagesCreate` fixture → `RealAnthropicClient.createMessage()` returns the exact shaped `Message`.
- Streaming success: a new nock-based streaming fixture (added to `backend/src/testing/http-fixtures/anthropic.fixtures.ts` if it doesn't already cover `messages.create`'s streamed form) → `RealAnthropicClient.streamMessage()` yields the raw events in order.
- Auth failure: a new `mockAnthropicMessagesAuthError`-style fixture for `messages.create` specifically (distinct from `key-health.md`'s existing `mockAnthropicModelsAuthError`, which covers `models.list`) → `RealAnthropicClient.createMessage()` throws the normalized exception, not the raw SDK error.
- `FAKE_MODE=true` end-to-end (extends `app.e2e-spec.ts` or a dedicated spec): with any placeholder `ANTHROPIC_API_KEY` (including an obviously-invalid one), `AnthropicClient` resolves to `FakeAnthropicClient` and **no outbound HTTP call is attempted at all** — assert via `nock`'s pending-mocks/network-disabled state, proving the real key's validity is provably irrelevant in fake mode.
- `FAKE_MODE=false` end-to-end: `AnthropicClient` resolves to `RealAnthropicClient`, proven by `nock` intercepting the outbound call it makes — still only a placeholder credential, never a real one.

Manual-only (never run by an automated test, and never run by the coding agent under any circumstance — per `testing-strategy.md`'s no-real-credential rule and the user's own explicit instruction):
- Dev + real key + `FAKE_MODE=false`: the developer (a human) manually confirms a real Foundations Console call succeeds once that feature exists.
- Prod + real key + `FAKE_MODE=false`: the developer manually confirms the same via `docker-compose.prod.yml`, the actual target "run locally for real" use case.
- Confirming a real key is never present in whatever instance gets deployed publicly is a deployment-discipline check on the user's own process, not something this task builds or tests for.

## To-do list

- [ ] Relocate `AnthropicClient`/`AnthropicMessage`/`AnthropicMessageParams`/`AnthropicStreamEvent` from `backend/src/testing/anthropic/anthropic-client.ts` to `backend/src/shared/anthropic-client/anthropic-client.ts`.
- [ ] Update `backend/src/testing/anthropic/fake-anthropic-client.ts` and `backend/src/testing/index.ts` to import the token/types from the new shared location.
- [ ] Implement `RealAnthropicClient` (`backend/src/shared/anthropic-client/real-anthropic-client.ts`), including the normalized-exception mapping from `task-api-error-handling`.
- [ ] Implement `AnthropicClientModule` (`backend/src/shared/anthropic-client/anthropic-client.module.ts`) wiring `fakeSwitchProvider`.
- [ ] Add the streaming-success and `messages.create` auth-error `nock` fixtures to `backend/src/testing/http-fixtures/anthropic.fixtures.ts` if not already present in a usable form.
- [ ] Write the unit/integration tests in Test scenarios above.
- [ ] Update `test-doubles.md` to reflect the token's new location (the fake implementation's own location doesn't change).
- [ ] No Compose/`.env.example` changes expected — confirm by reading, not running, that `FAKE_MODE`/`ANTHROPIC_API_KEY` already flow identically into dev and prod per the citations above; flag here if reading turns up an actual gap.

## Open questions

None — resolved during this planning pass (mode matrix above, and the error-shaping gap split into `task-api-error-handling`).
