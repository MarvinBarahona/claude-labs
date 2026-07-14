# Task — API Key Health Check

**Status:** Planned.

**Depends on:**

- [`fake-mode.md`](../shared/fake-mode.md), "Interface" — the `GET /api/mode` route and the App Shell banner pattern this task extends, rather than inventing a second mode-reporting endpoint and a second banner slot.
- [`env-config.md`](../shared/env-config.md), "Interface" — `AppConfigService.anthropicApiKey`, the value this task actually validates. `env-config.md`'s own startup check only confirms the variable is *set*, never that it's a working key (see `testing-strategy.md`, "Startup validation only checks presence, never validity") — this task is what closes that gap, at runtime rather than at Nest bootstrap.
- [`app-shell.md`](../shared/app-shell.md), "Interface" — the persistent header this task's banner renders inside, same as fake mode's banner.

## Purpose

Today, an invalid or expired `ANTHROPIC_API_KEY` in real mode (`FAKE_MODE=false`) fails silently at the point of use: `env-config.md`'s startup check only confirms the variable is *set*, and the first real Claude API call then fails with an ordinary per-request error, surfaced wherever `architecture.md`'s error contract already puts it — inside that one lab's own inspector/error UI. Nothing tells the person running the app, up front and unmistakably, that the entire app is non-functional because of the key, the way a browser's own "you are offline" banner would.

**Goal, from the person who requested this task:** when the API key isn't valid or working, say so very emphatically — the app should make it obvious that a broken key makes the whole app useless, not bury it in one lab's error output.

This is checked for free: the Models API (`GET /v1/models`) is a metadata-only endpoint — no completion, no token cost — that still requires a valid key and returns the standard `401 authentication_error` shape for a bad one. That means the check can run proactively (before anyone tries a lab), not only reactively after a real call happens to fail.

## Interface

- **What's called:** `client.models.list()` (the Anthropic SDK's Models API), not `client.models.retrieve(<id>)` — listing models only requires valid authentication, while retrieving one specific model ID could 403 (`permission_error`) for a key that's valid but lacks access to that particular model, producing a false "invalid" reading unrelated to whether the key actually works.
- **Its own client, not the fake-mode DI switch:** this task instantiates a minimal Anthropic SDK client directly (`AppConfigService.anthropicApiKey`), rather than routing through `fake-mode.md`'s DI-switch helper. That helper exists to swap a *feature's* client between real and fake implementations; this check has no fake counterpart to swap to — it's skipped entirely in fake mode (see below), never faked. `architecture.md`'s "reach the Claude API only through a shared module" principle doesn't yet have a shared Claude-client module to route through — per `repo-layout.md`'s promotion rule, that only gets created once a second consumer needs the same thing (the first real lab feature, not yet planned). Building one now for a single diagnostic ping would be exactly the premature abstraction the project avoids elsewhere.
- **Only runs in real mode:** the check (and everything below) is skipped entirely when `AppConfigService.fakeMode` is `true` — fake mode never makes a real call, so key validity is meaningless while it's active.
- **Caching:** the check result is cached in memory with a 5-minute TTL. `GET /api/mode` awaits the (possibly cached) check synchronously before responding — no separate background timer/cron, and no `'unknown'`/`'checking'` state ever reaches the client. A cold cache adds one Models API round-trip to that request's latency; a warm cache is instant. This catches a key that goes bad mid-run (unlike a startup-only check) without polling on its own schedule.
- **Error classification:** only a thrown `AuthenticationError` (HTTP 401, per `shared/error-codes.md`) flips the cached status to `invalid`. Any other error (rate limit, network failure, 5xx) is inconclusive about the key itself and leaves the previous cached status unchanged — or defaults to `valid` if no check has ever completed yet — so a transient network blip or an Anthropic outage never triggers a false "your key is broken" banner.
- **`GET /api/mode` extension:** `fake-mode.md`'s existing route gains `keyStatus: 'valid' | 'invalid'`, present in the response only when `fakeMode` is `false` (mirroring how `repoUrl` is present only when relevant to fake mode). Final shape: `{ fakeMode: boolean, repoUrl?: string, keyStatus?: 'valid' | 'invalid' }`.
- **Banner:** App Shell's one banner slot renders the fake-mode banner when `fakeMode` is `true`, or this task's key-invalid banner when `keyStatus === 'invalid'` — the two conditions are mutually exclusive by construction (`keyStatus` is never present when `fakeMode` is `true`), so App Shell never has to arbitrate between them. Unlike fake mode's neutral/informational banner, this one is styled as an urgent error state (the "you are offline" framing from the original request) — visually distinct so a broken key is impossible to miss, stating plainly that every feature calling the Claude API will fail until it's fixed.
- **Recovery:** no special clear-on-fix logic is needed. The cache is in-memory per process; fixing the key in `backend/.env` already requires a container restart for the env change to take effect at all (per `env-config.md`), which starts a fresh process with an empty cache — the next check (fast, since it's awaited on the next `GET /api/mode` call) reflects the corrected key.

## Open questions

None. Resolved — see "Interface" above for each:

- **When the check runs:** proactively, lazily, on a 5-minute cache TTL — not a startup-only check, not a separate polling timer.
- **Where the check lives relative to `FAKE_MODE`:** skipped entirely when `fakeMode` is `true`.
- **Response/caching shape:** `GET /api/mode` gains `keyStatus`, computed from the in-memory TTL cache, awaited synchronously.
- **Banner precedence:** mutually exclusive by construction — `keyStatus` is only ever present when `fakeMode` is `false`.
- **Retry/recovery:** no dedicated mechanism needed — a fixed key requires a restart anyway, which naturally resets the cache.

## Test scenarios

- [ ] With `FAKE_MODE=false` and a valid `ANTHROPIC_API_KEY`, `GET /api/mode` reports `keyStatus: 'valid'`, and no key-invalid banner renders in App Shell.
- [ ] With `FAKE_MODE=false` and an invalid/revoked `ANTHROPIC_API_KEY`, the Models API call fails with `AuthenticationError`, `GET /api/mode` reports `keyStatus: 'invalid'`, and App Shell shows the emphatic key-invalid banner.
- [ ] With `FAKE_MODE=true`, `GET /api/mode` omits `keyStatus` entirely regardless of the real key's actual validity, and no Models API call is made.
- [ ] The health check only ever calls the Models API (`client.models.list()`) — never a `messages.create()`/completion call — confirmed via a `nock`-style intercept per `testing-strategy.md`, so no test run risks a token-billed call.
- [ ] Repeated `GET /api/mode` requests within the 5-minute cache TTL reuse the cached result rather than making a fresh Models API call each time.
- [ ] After the TTL expires, the next `GET /api/mode` request triggers a fresh check.
- [ ] A transient non-auth error from the Models API call (network failure, 5xx) does not flip `keyStatus` to `invalid` — the previously cached status (or `valid`, if no check has completed yet) is preserved.
- [ ] The key-invalid banner and the fake-mode banner never render at the same time, for any combination of `fakeMode`/`keyStatus` the endpoint can actually report.

## To-do list

- [ ] Add a backend service that, when `!AppConfigService.fakeMode`, calls `client.models.list()` via a directly-instantiated Anthropic SDK client (`AppConfigService.anthropicApiKey`) to determine key validity, caching the result with a 5-minute TTL.
- [ ] Classify only `AuthenticationError` (401) as `invalid`; leave the cached status unchanged (defaulting to `valid` if none yet) on any other thrown error.
- [ ] Extend `GET /api/mode` (from `fake-mode.md`) to include `keyStatus: 'valid' | 'invalid'`, present only when `fakeMode` is `false`.
- [ ] Add the key-invalid banner to App Shell's persistent header, rendered when `/api/mode` reports `keyStatus: 'invalid'`, styled as an urgent error state distinct from the neutral fake-mode banner.
- [ ] Confirm via a `nock`-style intercept (per `testing-strategy.md`) that the health check only ever reaches the Models API endpoint, never a completions endpoint.
- [ ] Confirm the 5-minute cache behavior (cache hit within TTL, fresh check after expiry) end to end.

## Build order & dependencies

Not yet placed relative to the rest of the backlog beyond depending on `fake-mode.md` and `app-shell.md` — provisionally sequenced right after fake mode in `status.md`, since it extends that task's `GET /api/mode` endpoint and banner mechanism rather than building its own from scratch. `plan-work-item` can adjust if a better position becomes clear.
