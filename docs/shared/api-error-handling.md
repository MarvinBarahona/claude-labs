# API Error Handling

Every non-2xx response from the backend carries the same shape — `{ error: { message, source } }`, where `source` names which system failed (the Claude API, a specific external data source, or the app itself) — and a real failure is never swallowed into a misleading `200`. This is the shared mechanism that produces that shape for every route, so no individual lab or client wrapper has to build its own error handling.

A normal (non-streaming) request/response cycle gets this for free from a global Nest exception filter. A streaming response can't go through that filter — once a controller takes over the response to stream Server-Sent Events, it's already past the point a global filter can rewrite the HTTP status or body — so a streaming controller instead calls this module's pure `shapeError()` function directly inside its own `try`/`catch` around its SSE loop, and writes the result as a terminal `event: error` frame (`event: error\ndata: <JSON.stringify(body)>\n\n`) instead of an HTTP status. Both paths produce byte-identical error bodies because both go through the same `shapeError()`.

## Interface

All exported from `backend/src/shared/api-error-handling/` (barrel: `index.ts`).

- **`ExternalApiError`** (`external-api.error.ts`) — `class ExternalApiError extends Error { constructor(public readonly source: string, message: string) }`. Any client wrapper that talks to an external system (the Claude API, GitHub, a future data source) throws this instead of letting the underlying SDK's own error propagate — `new ExternalApiError('anthropic', <original message>)`, `new ExternalApiError('github', ...)`, etc. `source` is an arbitrary string chosen by the throwing client; nothing here hardcodes a fixed list, so adding a new external data source never requires touching this module.
- **`shapeError(exception: unknown): ShapedError`** (`shape-error.ts`) — the one place a thrown value becomes the documented response shape. Pure function, no side effects (no logging), so it's trivial to unit-test and safe to call from anywhere.
  - `ExternalApiError` → `{ status: 502, body: { error: { message: exception.message, source: exception.source } } }`.
  - Anything else (an unexpected bug, a thrown non-`Error` value, anything not deliberately raised as `ExternalApiError`) → `{ status: 500, body: { error: { message: 'An unexpected error occurred', source: 'app' } } }` — a fixed, generic message, never the real exception's own message or stack. This app can be deployed publicly in fake mode, so an unhandled 500 must never leak internal detail into the response body.
  - `ShapedError` is the exported return type: `{ status: number; body: { error: { message: string; source: string } } }`.
- **`AllExceptionsFilter`** (`all-exceptions.filter.ts`) — `@Catch() class AllExceptionsFilter implements ExceptionFilter`. Registered globally (see `ApiErrorHandlingModule` below), so it runs for every route without per-controller wiring.
  - A Nest `HttpException` (validation-pipe rejection, 404 on an unknown route, any deliberate `throw new SomeHttpException(...)`) passes through completely unchanged — untouched status, untouched body. This shape is only for a Claude-API/data-source/app *failure*, not a client request-shape rejection.
  - Anything else goes through `shapeError()` and is responded as `response.status(status).json(body)`.
  - Logs the original exception server-side via Nest's `Logger` whenever the shaped status is `>= 500` — this includes both the generic `500` case and the `502` `ExternalApiError` case, so every external-API failure is logged, not only unexpected bugs. The original message/stack only ever reaches the log, never the response body.
- **`ApiErrorHandlingModule`** (`api-error-handling.module.ts`) — `providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }]`. Imported into `AppModule` (`backend/src/app.module.ts`) once, alongside the other shared modules; no other module needs to import it, and no change is needed in `main.ts`.

## Using it

- A backend client wrapper that calls an external system catches whatever its underlying SDK/HTTP client throws on failure and rethrows `new ExternalApiError('<source>', <message>)`. That's the only integration point — the global filter handles the rest automatically for any ordinary controller route.
- A streaming controller (none exists yet as of this writing) calls `shapeError(exception)` directly inside its own SSE catch block and writes the result as a terminal `event: error` frame, since the global filter can't intercept a response already taken over for streaming.
- `KeyHealthService` (`key-health.md`) is a deliberate non-consumer: it never throws to a controller, it returns a cached status, so it isn't routed through this filter.

## Testing

- `backend/src/shared/api-error-handling/shape-error.spec.ts` — covers all three `shapeError()` cases: `ExternalApiError` → 502, a plain `Error` → generic 500 with the original message never present in the body, and a thrown non-`Error` value → the same generic 500.
- `backend/src/shared/api-error-handling/all-exceptions.filter.spec.ts` — constructs the filter directly against a mocked `ArgumentsHost`/Express response: `ExternalApiError` → `502` with the shaped body, a Nest `HttpException` (`BadRequestException` standing in for a validation rejection) → passed through verbatim, and a plain `Error` → `500` with the generic body plus a `Logger.prototype.error` call carrying the original exception.
- `backend/test/api-error-handling.e2e-spec.ts` — bootstraps a dedicated `TestingModule` (`ApiErrorHandlingModule` plus a throwaway test-only controller defined in the spec) and drives it over a real HTTP round trip via `supertest`, proving the `APP_FILTER` wiring actually takes effect in a real bootstrapped app, not just in the unit tests above: `ExternalApiError` → `502`, a plain `Error` → `500` with the generic body, and a `BadRequestException` → Nest's own default `400` shape unchanged.
