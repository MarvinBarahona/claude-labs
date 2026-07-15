# Feature — Foundations Console

**Status:** 📋 Planned.

**Nav position:** first.

## Claude API features

- **Models** — pick a tier by cost/speed/depth: Opus (deepest, slowest, priciest — hard problems), Sonnet (balanced default), Haiku (fastest/cheapest — classification, extraction), Fable (most capable, priciest tier — an explicit opt-in the picker exposes, never the default).
- **Request/response lifecycle** — every request needs an API key, `model`, `messages` (alternating `user`/`assistant` turns), `max_tokens`; the response returns `content` (blocks), `usage` (token counts), and `stop_reason` (max tokens reached / natural end / stop sequence hit).
- **Multi-turn conversation state** — the Messages API is stateless; the app must keep and resend the full message history on every turn.
- **System prompts** — a separate `system` string sets persona/instructions and applies to every turn without counting as a turn itself.
- **Temperature** — a 0–1 dial on next-token sampling: low (0–0.3) for deterministic/factual output, high (0.8–1.0) for creative/varied output.
- **Streaming** — the response arrives as incremental events (`message_start`, `content_block_delta`, ..., `message_stop`) instead of one blocking call.
- **Structured (JSON-schema) output** — use `output_config: {format: {type: "json_schema", schema}}` (`client.messages.parse` validates automatically); the older prefill-plus-stop-sequence trick is broken on current models (Fable 5, Opus 4.6+, Sonnet 4.6+ reject a trailing assistant message with a 400 error).

## Main idea

A raw API explorer — model picker, system-prompt editor, temperature slider, streaming toggle, running transcript, `stop_reason`/`usage` readout, and a structured-output demo (schema-constrained JSON response). This is the feature that *is* the raw mechanics; every later feature builds on what it establishes.

## Dataset

None — user-driven input only. No external data source, no feature-specific env vars beyond the global `ANTHROPIC_API_KEY`.

## Build order & dependencies

Built right after five foundational tasks already exist (see `status.md` for current position): [`env-config.md`](../shared/env-config.md), [`model-config.md`](../shared/model-config.md), [`inspector-panel.md`](../shared/inspector-panel.md), [`docs-panel.md`](../shared/docs-panel.md), and [`app-shell.md`](../shared/app-shell.md). This feature is the first place all four of the latter are exercised together end-to-end, against a real Claude API call:

- **Inspector panel** — already built against fixture data; this feature is its first real-data consumer.
- **Docs panel** — already built against a fixture doc; this feature is its first real-feature consumer.
- **Config/model layer** — already built; this feature's model picker is its first real consumer.
- **App shell** — already built against a mock route; this feature is its first real-route consumer, and the first entry in the live nav.

No other feature can be built before this one, since the inspector, docs-rendering, and navigation shell (now already in place) are reused by every subsequent feature.

Also depends on [`anthropic-client.md`](../shared/anthropic-client.md) — its `AnthropicClient` DI token (`createMessage()` / `streamMessage()`) is what this feature's backend service actually calls.

Also depends on [`api-error-handling.md`](../shared/api-error-handling.md) — its global exception filter already shapes the non-streaming `/messages` and `/structured` routes' failures for free (nothing to wire here). Its streaming `/messages` path is the first consumer of that doc's `shapeError()` function directly: the SSE loop's own `try`/`catch` calls `shapeError(exception)` and writes the result as a terminal `event: error` frame (`data: <JSON.stringify(body)>`) instead of setting an HTTP status — no closing `event: turn_complete` envelope follows an error frame.

## Files API / base64

Not applicable — no documents or images in this feature.

## Guiding principles / standing decisions cited

- [`architecture.md`](../technical/architecture.md), "Request/response contract (the inspector's data shape)" — the envelope both endpoints below return.
- `architecture.md`, "Streaming transport" — the SSE mechanics and terminal-envelope-event rule the streaming path follows.
- [`repo-layout.md`](../technical/repo-layout.md), "Lab areas" and "Deciding where a piece of code goes" — this feature's own code goes in a fresh top-level `foundations-console` folder on each side (`backend/src/foundations-console/`, `frontend/src/app/foundations-console/`), sibling to `shared/`, not nested under it.
- [`model-config.md`](../shared/model-config.md) — `ModelConfigService.getModel(tier)` for the `default`/`classification`/`hardest-call` tiers; Fable is deliberately outside that mapping (see Contract below).

## Contract (backend/frontend independent tracks)

Both endpoints live in a new module, `backend/src/foundations-console/foundations-console.module.ts`, importing `ModelConfigModule` and the `AnthropicClientModule` from `task-anthropic-client`.

**Shared type**, `ModelChoice = 'default' | 'classification' | 'hardest-call' | 'fable'` — the four options the model picker shows, labeled in the UI as Sonnet/Haiku/Opus/Fable respectively. The first three resolve via `ModelConfigService.getModel(tier)`; `'fable'` resolves via a small local constant in the service (e.g. `FABLE_MODEL_ID = 'claude-fable-5'`) since Fable is deliberately excluded from `ModelConfigService`'s own tier mapping (see `model-config.md`) and needs no env-override — this console is the one place its raw ID is ever referenced directly.

**`POST /api/foundations-console/messages`** — the main transcript turn.

Request body:
```ts
{
  modelChoice: ModelChoice;
  systemPrompt?: string;       // omitted/empty → no `system` field sent
  temperature?: number;        // 0–1; validated with class-validator @Min(0) @Max(1) @IsOptional
  messages: { role: 'user' | 'assistant'; text: string }[]; // full history, resent every turn
  stream: boolean;
}
```

Validation errors (bad `temperature` range, empty `messages`, invalid `modelChoice`) surface as a `400` via Nest's standard validation pipe — not the `{ error: { message, source } }` shape, which per `architecture.md`'s "Error contract" is for a Claude-API/data-source/app failure, not a request-shape rejection.

Non-streaming response (`stream: false`), one call so no `calls` array — the envelope from `architecture.md`:
```ts
{
  request: MessageCreateParams;   // exact body sent to the Messages API
  response: Message;              // exact Claude response
  usage: { inputTokens, outputTokens, cacheCreationInputTokens?, cacheReadInputTokens? };
  stopReason: string | null;
}
```

Streaming response (`stream: true`): `text/event-stream` on the same route. Each Claude event (`message_start`, `content_block_delta`, ...) is forwarded verbatim, named by its own `type`. The stream ends with one terminal event (`event: turn_complete`) whose `data` is the same envelope shape above. No app-level tool-call events — this feature has no custom tool, only the direct Messages API call.

**`POST /api/foundations-console/structured`** — the structured-output demo. No streaming toggle; `client.messages.parse()` is a blocking call.

Request body:
```ts
{
  modelChoice: ModelChoice;
  input: string;   // free text the user pastes in, e.g. a support message or meeting note
}
```

Fixed demo schema (hardcoded in the service, not user-editable — keeps this a demo of the mechanic, not a schema builder):
```ts
{ summary: string; sentiment: 'positive' | 'neutral' | 'negative'; actionItems: string[] }
```

Response: same envelope shape as above. The frontend reads the parsed structured object directly off `response` (wherever the SDK's `parse()` return places it) to render the demo's own output; the inspector panel renders the same `request`/`response` pair opaquely, same as the main transcript.

**Frontend consumes both** by shaping whatever comes back into `InspectorCall` (`request`, `response`, `streamEvents?`, `stopReason`, `usage` — see `inspector-panel.md`) and binding it to `<app-inspector-panel [call]>`; for the streaming case, `streamEvents` is replaced wholesale with a new array reference as SSE events arrive, read via a `fetch()` body reader (never `EventSource`, which can't carry this route's POST body — per `architecture.md`'s "Streaming transport").

## Frontend composition

`frontend/src/app/foundations-console/foundations-console.ts`, registered in `FEATURE_ROUTES` (`frontend/src/app/core/feature-registry.ts`) as the first entry, stacked per `app-shell.md`'s docs → demo → inspector convention:

1. `<app-docs-panel [slug]="'foundations-console'">`.
2. Demo: model picker (4 options above), system-prompt textarea, temperature slider (0–1, step 0.1), streaming toggle, running transcript (user/assistant turns) with a message input + Send button; a separate "Structured output demo" sub-section (free-text textarea, Run button, rendered parsed-JSON result) below the transcript.
3. `<app-inspector-panel [call]>` bound to whichever of the two demo actions (transcript send, or structured-demo run) most recently completed.

## Test scenarios

Backend unit (`foundations-console.service.spec.ts`, fake `AnthropicClient` bound via DI):
- Non-streaming `/messages`: builds a `MessageCreateParams` with `system` omitted when `systemPrompt` is unset, present when set; resolves each of the four `modelChoice` values to the correct model ID (three via `ModelConfigService`, `'fable'` via the local constant); shapes the fake response into the envelope (`stopReason`, `usage`, no `calls` array).
- Streaming `/messages`: forwards the fake client's canned stream events verbatim, named by `type`, followed by exactly one terminal envelope event.
- Streaming `/messages`, fake client throws mid-stream: yields a terminal `event: error` frame (via `task-api-error-handling`'s `shapeError()`) instead of the `turn_complete` envelope event.
- `/structured`: sends the fixed schema via `output_config`; shapes the fake parsed response into the same envelope shape.

Backend integration (`foundations-console.e2e-spec.ts`, `nock` intercepting the real SDK's outbound call):
- `POST /messages` non-streaming end to end, real request-building/response-shaping code exercised, `nock` fixture stands in for the Messages API.
- `POST /messages` with an invalid `temperature` (e.g. `1.5`) or empty `messages` returns `400` before any outbound call is attempted.
- `POST /structured` end to end against a `nock` fixture returning a canned structured response.

Frontend unit (`foundations-console.spec.ts`, `HttpTestingController`):
- Model picker shows all four options labeled Sonnet/Haiku/Opus/Fable; selecting one is reflected in the next request's `modelChoice`.
- Temperature slider clamps to 0–1 and is included in the request body.
- Sending a transcript message appends it to the running transcript and, on response, appends the assistant's reply.
- Streaming toggle on: transcript updates incrementally as mocked SSE chunks arrive; toggle off: transcript updates once, from a single mocked JSON response.
- Structured-output demo: running it renders the parsed `summary`/`sentiment`/`actionItems` fields, not just raw JSON text.
- Inspector panel receives an `InspectorCall` matching whichever action (transcript send or structured-demo run) most recently completed.

Frontend integration (against a real backend process with the fake `AnthropicClient` bound in place, per `test-doubles.md`):
- A full `/messages` non-streaming round trip renders the assistant's reply and populates the inspector panel from the real HTTP response.
- A full `/messages` streaming round trip parses real SSE framing over `fetch()` and renders incrementally.
- A full `/structured` round trip renders the parsed demo output from a real HTTP response.

## To-do list

- [ ] Confirm `task-anthropic-client` has reached at least `Planned` (or build it inline as part of this feature's backend track) before wiring `foundations-console.service.ts` — this feature's backend has a hard dependency on its `AnthropicClient` token existing at a build-included location.
- [ ] Backend: `foundations-console.module.ts`, `foundations-console.controller.ts`, `foundations-console.service.ts`, `dto/send-message.dto.ts`, `dto/structured-demo.dto.ts` under `backend/src/foundations-console/`.
- [ ] Backend: implement `ModelChoice` resolution (three tiers via `ModelConfigService`, `'fable'` via a local constant).
- [ ] Backend: implement `POST /api/foundations-console/messages` (non-streaming + SSE streaming paths, terminal envelope event).
- [ ] Backend: streaming path's own `try`/`catch` reuses `task-api-error-handling`'s `shapeError()` to write a terminal `event: error` frame on failure, per that task's "Scope decision" section.
- [ ] Backend: implement `POST /api/foundations-console/structured` with the fixed demo schema.
- [ ] Backend tests: unit (fake `AnthropicClient`) + integration (`nock`) per Test scenarios above.
- [ ] Frontend: `frontend/src/app/foundations-console/foundations-console.ts` composing docs/demo/inspector per the stacking convention.
- [ ] Frontend: model picker, system-prompt editor, temperature slider, streaming toggle, transcript, structured-output demo sub-section.
- [ ] Frontend: SSE parsing via `fetch()` body reader (no `EventSource`).
- [ ] Frontend: register the route as the first entry in `FEATURE_ROUTES` (`frontend/src/app/core/feature-registry.ts`).
- [ ] Frontend tests: unit (`HttpTestingController`) + integration (real backend process, fake `AnthropicClient` bound) per Test scenarios above.
- [ ] Run `write-lab-doc` against the finished lab once built (per `guiding-principles.md`'s "Docs travel with code" — no automatic reminder elsewhere).

## Open questions

None.
