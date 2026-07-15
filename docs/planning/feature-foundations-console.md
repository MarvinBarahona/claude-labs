# Feature — Foundations Console

**Status:** 🔵 In progress.

**Nav position:** first.

## Claude API features

- **Models** — pick a tier by cost/speed/depth: Opus (deepest, slowest, priciest — hard problems), Sonnet (balanced default), Haiku (fastest/cheapest — classification, extraction).
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
- [`model-config.md`](../shared/model-config.md) — `ModelConfigService.getModel(tier)` for the `default`/`classification`/`hardest-call` tiers.

## Contract (backend/frontend independent tracks)

Both endpoints live in a new module, `backend/src/foundations-console/foundations-console.module.ts`, importing `ModelConfigModule` and the `AnthropicClientModule` from `task-anthropic-client`.

**Shared type**, `ModelChoice = 'default' | 'classification' | 'hardest-call'` — the three options the model picker shows, labeled in the UI as Sonnet/Haiku/Opus respectively, all resolved via `ModelConfigService.getModel(tier)`.

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

**`POST /api/foundations-console/structured`** — the structured-output demo. No streaming toggle; a single blocking call through the same `AnthropicClient.createMessage()` used by `/messages` above — not the SDK's `client.messages.parse()` convenience wrapper, which would require touching the raw SDK client directly and so bypass `AnthropicClient` (breaking fake mode and the "reach the Claude API only through the shared module" principle — `architecture.md`, "Communication boundaries"). `createMessage()` already accepts arbitrary `MessageCreateParams`, so this route sets `output_config: {format: {type: "json_schema", schema: FIXED_SCHEMA}}` on the params it passes in, then `JSON.parse()`s the first `text` content block of the response itself — the same mechanic `.parse()` performs SDK-side, just done in this feature's own service.

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

Response: the same envelope shape as above, plus a sibling top-level `parsed` field carrying the `JSON.parse()`d object (the fixed schema shape above). The frontend reads `parsed` directly to render the demo's own output; the inspector panel renders the same `request`/`response` pair opaquely, same as the main transcript.

**Frontend consumes both** by shaping whatever comes back into `InspectorCall` (`request`, `response`, `streamEvents?`, `stopReason`, `usage` — see `inspector-panel.md`) and binding it to `<app-inspector-panel [call]>`; for the streaming case, `streamEvents` is replaced wholesale with a new array reference as SSE events arrive, read via a `fetch()` body reader (never `EventSource`, which can't carry this route's POST body — per `architecture.md`'s "Streaming transport").

## Frontend composition

`frontend/src/app/foundations-console/foundations-console.ts`, registered in `FEATURE_ROUTES` (`frontend/src/app/core/feature-registry.ts`) as the first entry, stacked per `app-shell.md`'s docs → demo → inspector convention:

1. `<app-docs-panel [slug]="'foundations-console'">`.
2. Demo: model picker (4 options above), system-prompt textarea, temperature slider (0–1, step 0.1), streaming toggle, running transcript (user/assistant turns) with a message input + Send button; a separate "Structured output demo" sub-section (free-text textarea, Run button, rendered parsed-JSON result) below the transcript.
3. `<app-inspector-panel [call]>` bound to whichever of the two demo actions (transcript send, or structured-demo run) most recently completed.

## Test scenarios

Backend unit (`foundations-console.service.spec.ts`, fake `AnthropicClient` bound via DI):
- Non-streaming `/messages`: builds a `MessageCreateParams` with `system` omitted when `systemPrompt` is unset, present when set; resolves each of the three `modelChoice` values to the correct model ID via `ModelConfigService`; shapes the fake response into the envelope (`stopReason`, `usage`, no `calls` array).
- Streaming `/messages`: forwards the fake client's canned stream events verbatim, named by `type`, followed by exactly one terminal envelope event.
- Streaming `/messages`, fake client throws mid-stream: yields a terminal `event: error` frame (via `task-api-error-handling`'s `shapeError()`) instead of the `turn_complete` envelope event.
- `/structured`: calls the fake `AnthropicClient.createMessage()` with the fixed schema on `output_config`; `JSON.parse()`s the fake's canned text-block response and shapes it into the envelope plus `parsed`.

Backend integration (`foundations-console.e2e-spec.ts`, `nock` intercepting the real SDK's outbound call):
- `POST /messages` non-streaming end to end, real request-building/response-shaping code exercised, `nock` fixture stands in for the Messages API.
- `POST /messages` with an invalid `temperature` (e.g. `1.5`) or empty `messages` returns `400` before any outbound call is attempted.
- `POST /structured` end to end against a `nock` fixture returning a canned structured response.

Frontend unit (`foundations-console.spec.ts`, `HttpTestingController`):
- Model picker shows all three options labeled Sonnet/Haiku/Opus; selecting one is reflected in the next request's `modelChoice`.
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

- [x] `anthropic-client.md` has since graduated to `Done` — its `AnthropicClient` token (`createMessage()` / `streamMessage()`) is already available at `backend/src/shared/anthropic-client/` for `foundations-console.service.ts` to inject.
- [x] Backend: `foundations-console.module.ts`, `foundations-console.controller.ts`, `foundations-console.service.ts`, `dto/send-message.dto.ts`, `dto/structured-demo.dto.ts` under `backend/src/foundations-console/`.
- [x] Backend: implement `ModelChoice` resolution (three tiers via `ModelConfigService`).
- [x] Backend: implement `POST /api/foundations-console/messages` (non-streaming + SSE streaming paths, terminal envelope event).
- [x] Backend: streaming path's own `try`/`catch` reuses `task-api-error-handling`'s `shapeError()` to write a terminal `event: error` frame on failure, per that task's "Scope decision" section.
- [x] Backend: implement `POST /api/foundations-console/structured` with the fixed demo schema.
- [x] Backend tests: unit (fake `AnthropicClient`) + integration (`nock`) per Test scenarios above.
- [x] Frontend: `frontend/src/app/foundations-console/foundations-console.ts` composing docs/demo/inspector per the stacking convention.
- [x] Frontend: model picker, system-prompt editor, temperature slider, streaming toggle, transcript, structured-output demo sub-section.
- [x] Frontend: SSE parsing via `fetch()` body reader (no `EventSource`).
- [x] Frontend: register the route as the first entry in `FEATURE_ROUTES` (`frontend/src/app/core/feature-registry.ts`).
- [x] Frontend tests: unit (`HttpTestingController`) per Test scenarios above. The integration sub-scenario (real backend process, fake `AnthropicClient` bound) was **not** written — no existing precedent for that pattern anywhere under `frontend/` yet; see Development notes.
- [ ] Run `write-lab-doc` against the finished lab once built (per `guiding-principles.md`'s "Docs travel with code" — no automatic reminder elsewhere). Not run by this build pass — a separate, later action.

## Open questions

None.

## Development notes

- **[technical/shared-infra, fixed]** Live fake mode was silently broken for every `AnthropicClient` consumer, not just this feature. `FakeAnthropicClient` (`test-doubles.md`, `Done`) only ever returns a response when something has explicitly called `.queueMessage()`/`.queueStream()` first — the pattern every existing test uses. But a live running app (`FAKE_MODE=true`, a person clicking around) never pre-queues anything, and a consumer only ever sees the abstract `AnthropicClient` token, with no way to reach the concrete fake to queue one — so every unscripted call 500'd. This directly contradicted `fake-mode.md`'s own stated promise ("the running app can be clicked through end to end… without a real key"), and would have hit identically on every future `AnthropicClient` consumer (Live Tool-Use Console next). Fixed with a new opt-in `allowUnqueuedFallback` flag on `FakeAnthropicClient` (default `false` — every existing test's throw-on-empty behavior is completely unchanged), enabled only on the instance `AnthropicClientModule` binds for a live, fake-mode-running app. The fallback is schema-aware: if `output_config.format` requests structured JSON output, it returns a schema-conformant placeholder instead of prose, so a structured-output consumer still gets parseable JSON. `test-doubles.md` and `anthropic-client.md` updated to document this; new tests added to `fake-anthropic-client.spec.ts` and `anthropic-client.module.spec.ts`. Confirmed via user check-in before implementing, since it touches another already-`Done` work item's tested contract.
- **[bug, fixed]** `buildEnvelopeFromEvents` (the streaming turn's envelope reconstruction) spread `message_start`'s own message object, whose `content` is always `[]` in real Anthropic streaming — actual content only arrives via `content_block_delta` events — and never reassembled it. Every streamed turn's `turn_complete` envelope carried an empty `response.content`, so the frontend appended a blank assistant reply once streaming finished (raw stream events still rendered fine in the inspector; only the final envelope's reconstructed response was wrong). This would have affected the real Claude API's streaming responses too, not just fake mode — caught only by manually driving the streaming toggle in a browser, since the existing unit test asserted frame count/kind but never inspected `envelope.response.content`. Fixed by accumulating `content_block_start`/`content_block_delta` events by index in `foundations-console.service.ts`; strengthened the existing streaming unit test to assert on the reconstructed `content`.
- **[bug, fixed]** `POST /structured` returned Nest's default `201 Created` instead of `200` — no `@HttpCode` decorator, unlike `/messages`' non-streaming path which sets `res.status(200)` explicitly. One-line fix (`@HttpCode(200)`).
- **[process]** `class-validator`/`class-transformer` were not previously installed anywhere in the backend, and `main.ts` had no global `ValidationPipe` — this is the first work item to need request-body validation. Added both deps and `app.useGlobalPipes(new ValidationPipe({whitelist: true, transform: true}))`; the dev container's `node_modules` volume needed a `docker compose down -v` + rebuild to pick them up (documented in README's dependency-change note already; no doc change needed).
- **[process]** No existing precedent anywhere under `frontend/` for a frontend-integration test that drives a real backend process with the fake `AnthropicClient` bound. The frontend track's unit tests (`HttpTestingController` + mocked `fetch`) cover the contract; the "real round trip" test scenario in this plan's Test scenarios section was instead exercised manually (Playwright, against the real dev stack in fake mode) rather than as an automated test. Worth a `testing-strategy.md` note if/when a later feature (e.g. Live Tool-Use Console, which also streams) wants this pattern automated.
- **[coding-convention]** `DEFAULT_MAX_TOKENS = 4096` is a local constant in `foundations-console.service.ts` — the plan didn't specify a value and nothing else in the repo has an env-configurable default to defer to.
- **[coding-convention]** The streaming turn's `try`/`catch` (raw events verbatim → one `turn-complete` or one `error`, never both) lives inside `FoundationsConsoleService.streamTurn()`'s own async generator rather than literally in the controller, which just serializes whichever frame it's handed — matches this repo's "controllers stay thin" `nest-conventions` guidance without changing the plan's described frame sequence.
- **[coding-convention]** Model picker is rendered as labeled radio inputs rather than a `<select>` dropdown — matches "3 options, labeled Sonnet/Haiku/Opus" while keeping every option independently visible.
- **[process]** Several first-pass comments in this feature's backend/frontend code ran multiple lines explaining rationale that either was already obvious from the code or belonged in this Development notes section instead. Trimmed to one-line comments (or removed) after the fact — a reminder that code comments should stay short; a long WHY belongs in the work item's permanent doc, not the source file.
- **[product decision]** Fable was dropped from the model picker after manual testing — not needed at this stage. Removed the `'fable'` value from `ModelChoice`/`MODEL_CHOICES` and its backend `FABLE_MODEL_ID` resolution entirely rather than hiding it in the UI, since keeping dead resolution code around for an option nothing can select isn't worth it. Can be re-added later by reversing this change if the console needs it back.
- **[polish]** Manual testing also flagged three UI legibility/clarity issues, all fixed the same pass: (1) the top-level blocks (docs panel, console card, structured-output-demo card, inspector panel) had no gap between them at all — wrapped the template in a `flex flex-col gap-6` root; within the console card, added `divide-y divide-border` between the Model/System prompt/Temperature/Stream-toggle/Transcript subgroups so each one reads as a distinct block. (2) The transcript rendered every message identically — restyled as chat bubbles, user messages right-aligned in `bg-primary`, assistant messages left-aligned in `bg-secondary`. (3) All the small-caps section labels (Model, System prompt, Temperature, Transcript, Summary/Sentiment/Action items, and — for on-page consistency — the shared `InspectorPanel`'s Request/Response/Content blocks/Stream events) went from `text-muted-foreground font-medium` to `text-foreground font-bold` for contrast. Verified visually via Playwright screenshots in fake mode (see `browser-preview-check`), not just the existing unit tests, since none of them assert on Tailwind classes.
- **[polish]** The page read as one interaction instead of two: the transcript card's `<h2>` was generically titled "Foundations Console" (the feature's own name, duplicating the nav label) while "Structured output demo" sat in a visually lesser `<h3>`. Restructured so the feature name is now a page-level `<h1>` above both cards, and the transcript card's heading is "Transcript" — an equal-weight `<h2>` peer to "Structured output demo" — making the two independent interactions visually obvious without adding any explanatory copy (that's deferred to `write-lab-doc`, not built yet). Also dropped the now-redundant inner "Transcript" sub-label directly above the chat, since the card heading already says it.
