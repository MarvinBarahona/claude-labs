# Task — API error handling

**Status:** 📋 Planned.

## Description

A shared global Nest exception filter, plus one normalized exception class every external-client wrapper throws on failure, that together produce the response shape [`architecture.md`](../technical/architecture.md)'s "Error contract" section already commits every feature to: a non-2xx HTTP response carrying `{ error: { message, source } }` (`source` names which system failed — the Claude API, a specific data source, or the app itself), never swallowed into a misleading 200. Mid-stream, the same shape goes out as a terminal SSE error event instead of an HTTP status.

Needed because nothing in the backend currently implements this — there is no global exception filter and no normalized "external call failed" exception type anywhere in `backend/src/`. `architecture.md` documents the contract as a standing decision every feature/task plan must already fit inside, but until this task exists, a real failure (e.g. a bad `ANTHROPIC_API_KEY` surfacing on an actual Messages API call) would just propagate as whatever Nest's default unhandled-exception response happens to look like, not the documented shape.

This surfaced while planning `task-anthropic-client.md`: once `RealAnthropicClient` makes an actual SDK call, its failures need somewhere to land. Every future task that adds a real external-data-source client (`task-github-provider`, `task-deepwiki-connector`, etc.) will need the exact same shaping, so this is its own shared task rather than folded into `anthropic-client`'s scope — same reasoning as why `anthropic-client` itself was split out of `feature-foundations-console`.

## Scope decision: streaming isn't wired up yet, only made reusable

No lab or shared module streams a response today — nothing in `backend/src/` opens an SSE connection, and this task has no streaming consumer to build or test against yet. Nest's global-filter mechanism (`APP_FILTER`) only intercepts a normal request/response cycle; once a controller takes over `@Res()` to stream, it's already past the point a global filter can rewrite the HTTP status or body, so the mid-stream case was never going to be the same filter anyway — it has to be the streaming controller's own `try`/`catch` around its SSE loop, writing a terminal `event: error` frame itself.

So this task splits the one `architecture.md` contract into two pieces and only builds the reusable one: a pure `shapeError()` classification function (below) that turns any thrown value into the exact `{ status, body: { error: { message, source } } }` shape, used right now by this task's own HTTP filter, and reused later, unchanged, by whichever task first writes a streaming controller — that task calls `shapeError()` inside its own catch block and formats the result as an SSE frame (`event: error\ndata: <JSON.stringify(body)>\n\n`) instead of setting an HTTP status. Building that SSE-framing wrapper now, with nothing to call it or test it against, would be speculative; `shapeError()` being exported and pure is what makes adding it later a non-event rather than a rewrite. [`feature-foundations-console.md`](feature-foundations-console.md) is the first task naming a streaming endpoint and has been updated to cite this.

## Guiding principles / standing decisions cited

- [`architecture.md`](../technical/architecture.md), "Error contract" — the exact response shape (`{ error: { message, source } }`), the "never a misleading 200" rule, and the streaming/non-streaming split this task implements (see "Scope decision" above for how that split is actually built).
- [`repo-layout.md`](../technical/repo-layout.md), "Shared functionality" — this is a cross-cutting concern every external-client wrapper depends on, so it gets its own shared module: `backend/src/shared/api-error-handling/`, sibling to `model-config`/`fake-mode`/`key-health`.
- `nest-conventions`, "Cross-cutting concerns" — exception filters are Nest's own mechanism for turning domain errors into HTTP responses; this task uses `APP_FILTER` (Nest's DI-registered global-filter token) rather than wiring `app.useGlobalFilters()` by hand in `main.ts`, matching how every other shared concern here is a `.module.ts` Nest actually imports.

## Depends on

- [`key-health.md`](../shared/key-health.md) — existing precedent for classifying an `AuthenticationError` from the Anthropic SDK. Resolved (see "Error classification" below): that distinction stays entirely inside `KeyHealthService`'s own cache logic and this task doesn't reproduce it — `shapeError()` treats every `ExternalApiError` uniformly regardless of which underlying SDK error caused it, so nothing here needs updating if `key-health.md`'s own classification ever changes. `KeyHealthService` itself still isn't routed through this filter (it never throws to a controller — it returns a cached status).

## Consumers

- [`task-anthropic-client.md`](task-anthropic-client.md) (`Planned`) — `RealAnthropicClient` catches any thrown Anthropic SDK error and rethrows `ExternalApiError('anthropic', <original message>)` instead of letting the raw SDK error propagate; that task's own plan already names this one and defers the exact class name/import path to here (resolved below).
- [`feature-foundations-console.md`](feature-foundations-console.md) (`Planned`) — its non-streaming `/messages` and `/structured` routes get this task's shaping for free via the global filter; its streaming `/messages` path is the first place `shapeError()` gets reused directly inside a manual SSE catch block, per "Scope decision" above.

## Error classification

`shapeError(exception: unknown): { status: number; body: { error: { message: string; source: string } } }` — the one place a thrown value becomes the documented shape:

- `exception instanceof ExternalApiError` → `502`, `{ error: { message: exception.message, source: exception.source } }`. `source` is whatever string the throwing client passed — `'anthropic'` for `task-anthropic-client`, and a future data-source task's own choice (`'github'`, `'open-meteo'`, etc.) for its own client; this shared class never hardcodes a fixed list of sources, so a new data-source task never has to touch this file to add one.
- Anything else (an unexpected bug, a thrown non-`Error` value, anything not deliberately raised as `ExternalApiError`) → `500`, `{ error: { message: 'An unexpected error occurred', source: 'app' } }` — a fixed, generic message, never the real `exception`'s own message or stack, since this app can be deployed publicly (in fake mode) and an unhandled 500 must never leak internal detail to the response body. The real exception is still logged server-side (via Nest's `Logger`, in the filter, not in `shapeError()` itself — `shapeError()` stays a pure function with no side effects, so it's trivial to unit-test).

Deliberately not reshaped: Nest's own `HttpException`s (validation-pipe rejections, a 404 on an unknown route, etc.) pass through the filter completely unchanged — untouched status, untouched body. Per `architecture.md`'s contract, `{ error: { message, source } }` is for a Claude-API/data-source/app *failure*, not a client request-shape rejection; [`feature-foundations-console.md`](feature-foundations-console.md)'s Contract section already documents its own validation errors this way, so the filter has to leave `HttpException` alone rather than reshape it, or that feature's existing plan would be wrong.

## Contract (backend-only, no independent tracks)

- **`backend/src/shared/api-error-handling/external-api.error.ts`** (new) — `export class ExternalApiError extends Error { constructor(public readonly source: string, message: string) { super(message); this.name = 'ExternalApiError'; } }`.
- **`backend/src/shared/api-error-handling/shape-error.ts`** (new) — the pure `shapeError()` function above, plus its `ShapedError` return type, exported for reuse by a future streaming controller.
- **`backend/src/shared/api-error-handling/all-exceptions.filter.ts`** (new) — `@Catch() export class AllExceptionsFilter implements ExceptionFilter`. `catch(exception, host)`: get the HTTP response via `host.switchToHttp().getResponse()`; if `exception instanceof HttpException`, respond with its own `getStatus()`/`getResponse()` unchanged; otherwise call `shapeError(exception)`, log via `Logger` when `status >= 500`, and respond `response.status(status).json(body)`.
- **`backend/src/shared/api-error-handling/api-error-handling.module.ts`** (new) — `providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }]`. Imported into `AppModule` (`backend/src/app.module.ts`) alongside the other shared modules already there (`AppConfigModule`, `ModelConfigModule`, `FakeModeModule`) — no change needed to `main.ts`.
- **`backend/src/shared/api-error-handling/index.ts`** (new) — barrel export of `ExternalApiError`, `shapeError`/`ShapedError`, `AllExceptionsFilter`.

## Test scenarios

All backend; no real credential needed anywhere (per `testing-strategy.md`).

Unit (`shape-error.spec.ts`):
- `ExternalApiError('anthropic', 'boom')` → `{ status: 502, body: { error: { message: 'boom', source: 'anthropic' } } }`.
- A plain thrown `Error('leaky internal detail')` → `{ status: 500, body: { error: { message: 'An unexpected error occurred', source: 'app' } } }` — the original message never appears in `body`.
- A thrown non-`Error` value (e.g. a thrown string) → same generic `500` shape, defensively covering the fact JS allows throwing anything.

Unit (`all-exceptions.filter.spec.ts`, constructing the filter directly with a mocked `ArgumentsHost`/Express response):
- An `ExternalApiError` thrown by a route handler → response `status(502).json(...)` with the shaped body.
- A Nest `BadRequestException` (standing in for a validation-pipe rejection) → response reflects the exception's own `getStatus()`/`getResponse()` verbatim, proving the filter leaves `HttpException` alone.
- A plain unexpected `Error` → response `status(500)` with the generic body, and the filter's `Logger` is called with the original exception (spy on `Logger.prototype.error` or an injected logger).

Integration (extends `backend/test/app.e2e-spec.ts` or a dedicated `api-error-handling.e2e-spec.ts`, real bootstrapped `AppModule`, `supertest`):
- A throwaway test-only route that throws `ExternalApiError('anthropic', 'boom')` returns `502` with the documented body over a real HTTP round trip, proving `APP_FILTER` wiring actually takes effect in a real app, not just in the unit tests above.
- The same route thrown a plain `Error` returns `500` with the generic body, never the original message.
- An actual validation failure on an existing real route (or the same throwaway route with a bad DTO) still returns Nest's own default `400` shape unchanged.

## To-do list

- [ ] `backend/src/shared/api-error-handling/external-api.error.ts` — `ExternalApiError`.
- [ ] `backend/src/shared/api-error-handling/shape-error.ts` — `shapeError()` + `ShapedError`.
- [ ] `backend/src/shared/api-error-handling/all-exceptions.filter.ts` — `AllExceptionsFilter`.
- [ ] `backend/src/shared/api-error-handling/api-error-handling.module.ts` — `APP_FILTER` provider; import into `AppModule`.
- [ ] `backend/src/shared/api-error-handling/index.ts` — barrel export.
- [ ] Unit tests: `shape-error.spec.ts`, `all-exceptions.filter.spec.ts`.
- [ ] Integration test proving `APP_FILTER` wiring takes effect in a real bootstrapped app.
- [ ] Update `test-doubles.md`/`repo-layout.md` only if building this surfaces an actual gap in either — not expected, flag here if it does.

## Open questions

None — resolved during this planning pass (error classification and the streaming scope split above).
