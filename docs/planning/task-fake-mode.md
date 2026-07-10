# Task — Fake Mode

**Status:** Planned.

**Depends on:**

- [`env-config.md`](../shared/env-config.md), "Interface" and "Using it" — the app's one place reading environment variables. `FAKE_MODE` is added to `envSchema`/`AppConfigService` the same way any new config value is added there, not through a second ad hoc `process.env` read.
- [`task-test-doubles.md`](task-test-doubles.md), "Interface" — the fake implementations of each external client (Anthropic SDK, GitHub, Open-Meteo, arXiv, Wikimedia Commons) this task binds into the actual running app, not just into test suites. Building fake mode before test-doubles exists would mean maintaining two separate sets of fakes for the same clients.
- [`project-scaffold.md`](../shared/project-scaffold.md), "Structure" — Docker Compose already runs both projects and the backend already reads `backend/.env`; this task only adds a mode switch on top of that, not a new runtime or a `docker-compose.yml` change (`@nestjs/config` loads `.env` directly inside the backend container, independent of Compose's own env handling).
- [`task-app-shell.md`](task-app-shell.md), "Interface" — the persistent header/chrome component the fake-mode badge (see below) renders inside.

## Purpose

The app needs to run in two distinct modes:

- **Real mode** — a real `ANTHROPIC_API_KEY` (and other credentials) in `backend/.env`; every external call goes out for real. This is how the project owner actually uses the app day to day for manual testing, and how anyone else it's shared with is expected to run it: add keys to `.env`, `docker compose up`, nothing else.
- **Fake mode** — no real credentials, no outbound call to the Claude API or any external data source at all; every external client returns canned/fake data instead. For developing and manually exploring the running app — including a coding agent driving it — without needing a real key or spending real API budget just to click through a lab.

This is distinct from [`task-test-doubles.md`](task-test-doubles.md), which only covers automated test suites (booting an isolated module or a throwaway app instance for a single test run). Fake mode is about the actual long-running app process, started the normal way (`docker compose up`), behaving fully without any real credential — someone (or something) can open the frontend, click into any lab, and get a working demo end to end on fabricated data.

Fake mode never relaxes [`testing-strategy.md`](../technical/testing-strategy.md)'s "no container that runs tests ever holds a real credential" rule — it's a manual/interactive runtime mode only, never grounds for a test gated on real-credential presence. No test suite depends on `FAKE_MODE` at all: tests already substitute fakes directly via DI (per `testing-strategy.md`), independent of this flag.

## Interface

- **Mode selection:** an explicit `FAKE_MODE` boolean env var (default `false`), read through `AppConfigService.fakeMode` — not inferred from whether `ANTHROPIC_API_KEY` looks real. Auto-detection was considered and rejected: it's fuzzy to define correctly (what counts as a placeholder vs. a real key?) and risks silently landing in fake mode from a typo'd real key. An explicit flag is unambiguous, and costs nothing extra since `backend/.env` already needs a placeholder `ANTHROPIC_API_KEY` set to satisfy startup validation regardless of mode (`env-config.md`'s presence-only check) — fake mode doesn't change what that variable needs to contain, only what `FAKE_MODE` additionally says about which client implementations get bound.
- **DI switch:** a small reusable provider-factory helper (e.g. bind a client token to either its real or its fake implementation based on `AppConfigService.fakeMode`) that any external-client module calls — one shared switch, not a per-module if/else reinvented by every future client provider. This task builds and documents the helper; wiring it into a specific client's own provider happens when that client's own task/feature is built (none exist yet at this task's build order position — see "Consumers").
- **Visible indicator:** a minimal `GET /api/mode` backend route returning `{ fakeMode: boolean }` (no secrets), and a small badge in App Shell's persistent header that renders when it reports `true` — so fake mode is never mistaken for real mode from the running UI alone.

## Consumers

Every task or feature that talks to an external client (the Claude API, GitHub, or any future data source) wires its own client provider through this task's DI-switch helper — this task sits upstream of most of the backlog, the same way `env-config.md` and `task-test-doubles.md` already do. No such client provider exists yet at this task's own build order position (see "Build order & dependencies"), so this task's own to-do list builds and documents the mechanism generically; each later consumer wires its own provider through it when it's built.

## Build order & dependencies

Sits after [`task-test-doubles.md`](task-test-doubles.md) and [`task-app-shell.md`](task-app-shell.md), and before the first feature, Foundations Console (see `status.md` for current position) — both dependencies above (the fakes to bind, and the header to badge) need to already exist.

## Test scenarios

- [ ] With `FAKE_MODE=true` and only placeholder credentials in `.env`, `docker compose up` boots the backend successfully (startup validation still only checks presence, per `env-config.md`).
- [ ] With `FAKE_MODE=true`, a request that would otherwise call the Claude API returns the fake Anthropic client's canned response instead, with no outbound network call.
- [ ] With `FAKE_MODE=true`, a request that would otherwise call a data-source client returns that client's fake canned response instead, with no outbound network call.
- [ ] With `FAKE_MODE=false` (or unset) and real credentials present, the real clients are bound as before — fake mode never activates unintentionally.
- [ ] `GET /api/mode` reports `{ fakeMode: true }` when `FAKE_MODE=true`, and `{ fakeMode: false }` otherwise.
- [ ] With fake mode active, the app shell header shows the fake-mode badge; with it inactive, the badge doesn't render.
- [ ] Switching `FAKE_MODE` requires only an env change and restart — no code change needed to flip an already-wired client between real and fake.

## To-do list

- [ ] Add `FAKE_MODE` (boolean, default `false`) to `envSchema`/`AppConfigService`, following `env-config.md`'s convention for adding a new config value.
- [ ] Build the reusable provider-factory helper that binds a client token to its fake implementation (from `task-test-doubles.md`) instead of the real one when `AppConfigService.fakeMode` is true.
- [ ] Add `FAKE_MODE=false` to `backend/.env.example` alongside the existing placeholder values.
- [ ] Add the minimal `GET /api/mode` backend route returning `{ fakeMode: boolean }`.
- [ ] Add the fake-mode badge to App Shell's persistent header, rendered when `/api/mode` reports fake mode active.
- [ ] Confirm `docker compose up` with `FAKE_MODE=true` and placeholder-only credentials boots and serves a working demo end to end with no outbound network call.

## Open questions

None. Resolved:

- **Mode selection:** explicit `FAKE_MODE` env var, not auto-detected from key shape — see "Interface".
- **Tension with `guiding-principles.md`'s "Real data, not fixtures":** resolved with an explicit carve-out added to that principle, scoping it to a lab's real-mode design and calling out fake mode as a separate, opt-in override layered on top.
- **Guardrail against untestable-in-CI tests:** stated as an explicit non-goal above — fake mode is manual/interactive only and never justifies a real-credential-gated test; `testing-strategy.md`'s existing rule already covers this unchanged, so it needs no edit.
- **Fake data per lab:** incremental, reusing `task-test-doubles.md`'s fakes as each lab's own test doubles are added — no bespoke fake-mode-only data set.
- **UI visibility:** yes, a small badge in App Shell's header — see "Interface".
