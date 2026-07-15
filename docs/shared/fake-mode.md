# Fake Mode

The app runs in two distinct modes. **Real mode** — a real `ANTHROPIC_API_KEY` (and other credentials) in `backend/.env`; every external call goes out for real. **Fake mode** — no real credentials, no outbound call to the Claude API or any external data source at all; every external client returns canned/fake data instead, so the running app can be clicked through end to end (by a person or a coding agent) without a real key or real API spend.

This is distinct from [`test-doubles.md`](test-doubles.md), which only covers automated test suites (an isolated module or a throwaway app instance for a single test run). Fake mode is about the actual long-running app process, started either of the two ways the app runs (`docker compose -f docker-compose.dev.yml up`, or [`prod-docker.md`](prod-docker.md)'s `docker compose -f docker-compose.prod.yml up`), behaving fully without any real credential.

Fake mode never relaxes [`testing-strategy.md`](../technical/testing-strategy.md)'s "no container that runs tests ever holds a real credential" rule — it's a manual/interactive runtime mode only, never grounds for a test gated on real-credential presence. No test suite depends on `FAKE_MODE` at all: tests already substitute fakes directly via DI, independent of this flag.

## Interface

- **`AppConfigService.fakeMode`** — boolean, backed by the `FAKE_MODE` env var (default `false`). Explicit rather than auto-detected from whether `ANTHROPIC_API_KEY` looks real, so a typo'd real key can never silently land in fake mode.
- **`AppConfigService.repoUrl`** — `string | undefined`, backed by the optional `REPO_URL` env var, same optionality pattern as `githubToken` (see [`env-config.md`](env-config.md)). Meaningful only when `fakeMode` is `true` (the fake-mode banner is its only consumer); no default value.
- **`fakeSwitchProvider()`** (`backend/src/shared/fake-mode/fake-switch.provider.ts`) — the one shared DI switch every external-client module binds its provider through, instead of a per-module if/else:

  ```ts
  providers: [
    fakeSwitchProvider(SomeClientToken, { real: RealSomeClient, fake: FakeSomeClient }),
  ],
  ```

  It resolves the chosen class via Nest's `ModuleRef.create()` inside a `useFactory`, rather than a plain `useClass` swap — `useClass` can't branch at module-definition time on `AppConfigService.fakeMode`, which is only known once `ConfigModule` has loaded. `ModuleRef.create()` is Nest's supported way to instantiate an arbitrary `@Injectable()` class on demand with its own constructor deps still resolved through DI, so both the `real` and `fake` classes just need `@Injectable()` — no special-casing needed per consumer.
- **`GET /api/mode`** (`backend/src/shared/fake-mode/mode.controller.ts`) — returns `{ fakeMode: boolean, repoUrl?: string }` (no secrets — a repo URL isn't one). `repoUrl` is omitted from the response entirely when unset, never an empty string.
- **Fake-mode banner** (`frontend/src/app/shared/fake-mode-banner/`) — fetches `/api/mode` and renders nothing when `fakeMode` is `false`. When `true`, shows explanatory text stating this is a demo/fake-mode instance running on fabricated data; renders `repoUrl` as a clickable link when present, or the same text with no link when absent. Mounted in App Shell's persistent header (`frontend/src/app/shared/layout/`), so it's visible from every route.

## Using it

- A backend module that talks to an external client (the Claude API, GitHub, or any future data source) binds its provider through `fakeSwitchProvider()`, pointing `real` at its own real client implementation and `fake` at the corresponding fake from [`test-doubles.md`](test-doubles.md) — one call, no bespoke branching.
- If the real implementation class has a `private` field the fake implementation doesn't, pin the call's generic explicitly — `fakeSwitchProvider<SomeClientToken>(SomeClientToken, { real, fake })` — rather than letting it infer from `real`/`fake`. A `private` field makes TypeScript treat that class as only assignable to itself/subclasses, so inference can pick the concrete real class instead of the shared token, producing a build-time "fake not assignable to real" type error even though the wiring is correct.
- `backend/.env.example` documents `FAKE_MODE` and a commented-out `REPO_URL`, alongside the app's other placeholder values.
- Switching `FAKE_MODE` only requires an env change and a container restart — no code change, for any client already wired through `fakeSwitchProvider()`.

## Testing

- `backend/src/shared/config/config.schema.spec.ts` / `config.module.spec.ts` cover `FAKE_MODE`/`REPO_URL` defaulting, coercion, and pass-through.
- `backend/src/shared/fake-mode/fake-switch.provider.spec.ts` covers both branches of the switch, including that the chosen class's own constructor deps are resolved via DI.
- `backend/src/shared/fake-mode/mode.controller.spec.ts` and `backend/test/app.e2e-spec.ts` cover `GET /api/mode`'s response shape, including `repoUrl` omission when unset.
- `frontend/src/app/shared/fake-mode-banner/fake-mode-banner.spec.ts` covers the banner rendering nothing when fake mode is off, the explanatory text plus link when on with `repoUrl` set, text-only when on with `repoUrl` unset, and rendering nothing if the `/api/mode` request itself errors.
