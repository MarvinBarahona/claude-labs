# API Key Health Check

Proactively detects an invalid or expired `ANTHROPIC_API_KEY` in real mode and surfaces it unmistakably, rather than letting it fail silently until the first real Claude API call happens to error out inside one lab's own inspector/error UI.

The Models API (`GET /v1/models`) is a metadata-only endpoint — no completion, no token cost — that still requires a valid key and returns the standard `401 authentication_error` shape for a bad one. That's what this check calls, so it can run proactively (before anyone tries a lab), not only reactively after a real call happens to fail.

## Interface

- **`KeyHealthService`** (`backend/src/shared/key-health/key-health.service.ts`, exported by `KeyHealthModule`) — its own shared module, separate from `fake-mode.md`, since key validity is a distinct concern from fake mode's DI-switch/banner mechanism; only the response shape and header slot are actually shared.
  - `getKeyStatus(): Promise<KeyStatus>`, `KeyStatus = 'valid' | 'invalid'`.
  - Instantiates its own minimal `Anthropic` client directly from `AppConfigService.anthropicApiKey` (`new Anthropic({ apiKey, maxRetries: 0 })`) — not routed through `fake-mode.md`'s DI-switch helper, since that helper swaps a *feature's* client between real/fake implementations and this check has no fake counterpart; it's skipped entirely in fake mode instead (see below). `maxRetries: 0` keeps a transient failure fast and deterministic rather than paying the SDK's default retry backoff on every cold check.
  - Calls `client.models.list()` — never `models.retrieve(<id>)`, which could 403 for a key that's valid but lacks access to one particular model, producing a false "invalid" reading.
  - Caches the result in memory with a 5-minute TTL, checked against `Date.now()`. No separate background timer/polling — the next `getKeyStatus()` call after the TTL expires triggers a fresh check itself.
  - Error classification: only a thrown `AuthenticationError` (HTTP 401) flips the cached status to `invalid`. Any other error (rate limit, network failure, 5xx) is inconclusive about the key itself and leaves the previously cached status unchanged — or defaults to `valid` if no check has completed yet — so a transient blip or an Anthropic outage never produces a false "your key is broken" reading.
  - Never called at all when `AppConfigService.fakeMode` is `true` — fake mode makes no real call, so key validity is meaningless while it's active.
- **`GET /api/mode` extension** (`fake-mode.md`'s existing `ModeController`, `backend/src/shared/fake-mode/mode.controller.ts`) — gains `keyStatus?: 'valid' | 'invalid'`, present in the response only when `fakeMode` is `false` (mirroring how `repoUrl` is only present when relevant to fake mode). Final shape: `{ fakeMode: boolean, repoUrl?: string, keyStatus?: 'valid' | 'invalid' }`. The controller awaits `KeyHealthService.getKeyStatus()` synchronously before responding — a cold cache adds one Models API round-trip to that request's latency; a warm cache is instant.
- **Key-invalid banner** (`frontend/src/app/shared/key-health-banner/`, component `KeyHealthBanner`) — a sibling to `fake-mode.md`'s `FakeModeBanner`, independently fetching `/api/mode` and rendering only when `keyStatus === 'invalid'`. Mounted in App Shell's persistent header (`frontend/src/app/shared/layout/`) right alongside the fake-mode banner. Styled as an urgent error state — bold `text-destructive` on a tinted `bg-destructive/10` with a thick `border-b-2 border-destructive` underline (this project's design tokens have no `-foreground` companion for `destructive`, so a solid fill isn't used) — visually distinct from fake mode's neutral banner, stating plainly that every feature calling the Claude API will fail until the key is fixed.
- **Mutual exclusivity:** the fake-mode banner and the key-invalid banner never render together, by construction rather than by App Shell arbitrating between them — `keyStatus` is only ever present in the `/api/mode` response when `fakeMode` is `false`.
- **Recovery:** no special clear-on-fix logic. The cache is in-memory per process; fixing the key in `backend/.env` already requires a container restart for the env change to take effect at all, which starts a fresh process with an empty cache — the next check reflects the corrected key.

## Using it

This is a fully self-contained diagnostic — nothing else needs to consume `KeyHealthService` or `KeyHealthModule` directly. A lab feature doesn't need to check key validity itself; a broken key is already surfaced globally via the App Shell banner before anyone reaches a lab.

## Testing

- `backend/src/shared/key-health/key-health.service.spec.ts` — covers valid/invalid/transient-error classification, cache-hit-within-TTL, and fresh-check-after-TTL-expiry, using the shared `nock` Anthropic fixtures (`mockAnthropicModelsList` / `mockAnthropicModelsAuthError`) rather than mocking the SDK class, since the service instantiates a real client directly.
- `backend/src/shared/fake-mode/mode.controller.spec.ts` — covers `keyStatus` presence/omission and value passthrough.
- `backend/test/app.e2e-spec.ts` — covers the real `/mode` route end to end, with `nock` intercepting the outbound Models API call.
- `frontend/src/app/shared/key-health-banner/key-health-banner.spec.ts` — covers all four render states (valid, absent/fake-mode, invalid, request error).
