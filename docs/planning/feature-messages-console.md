# Feature — Messages Console

**Status:** 📋 Planned.

**Nav position:** first.

## Description

A raw Claude Messages API explorer: model picker, system-prompt textarea, temperature slider, streaming toggle, and a chat-style running transcript — carved out unchanged from Foundations Console's "Transcript" section (see `task-retire-foundations-console.md`, which retires that bundled page once this feature and `feature-structured-output-console.md` both exist). Demonstrates a plain multi-turn Messages API call, both streamed (Server-Sent Events) and non-streamed, including a system prompt and temperature control.

This is a fresh feature (its own slug, not a follow-on) — Foundations Console's own permanent doc is a different feature identity, being retired rather than renamed; see `task-retire-foundations-console.md`.

## Guiding principles / standing decisions cited

- `architecture.md`, "Streaming transport" — SSE on the same route as the non-streaming response, `stream` toggle in the body, raw Claude events forwarded verbatim, one terminal envelope event.
- `architecture.md`, "Error contract" — mid-stream failure as a terminal `event: error` frame instead of an HTTP status, with no closing envelope event after it.
- `app-shell.md`, "Lab page composition convention" — `DocsPanel` → demo → `InspectorPanel` stacking.

## Depends on

- `envelope-builder` (`Done`) — [`envelope-builder.md`](../shared/envelope-builder.md), "Interface" — `EnvelopeBuilderService.build(params, response): TurnEnvelope`, called by both `createTurn` and the streaming path's final reconstruction step below.
- `model-picker` (`Done`) — [`model-picker.md`](../shared/model-picker.md), "Interface" — `ModelPicker` component and its exported `ModelChoice` type, used instead of an inline `<select>`.
- `model-config` (`Done`) — [`model-config.md`](../shared/model-config.md), "Interface" — `ModelConfigService.getModel(tier)`, resolving `modelChoice` to a real model ID.
- `anthropic-client` (`Done`) — [`anthropic-client.md`](../shared/anthropic-client.md), "Interface" — `AnthropicClient.createMessage()` / `streamMessage()`.
- `inspector-panel` (`Done`) — [`inspector-panel.md`](../shared/inspector-panel.md), "Interface" — the `InspectorCall` shape this feature's page binds, including `streamEvents` for the running stream.
- `docs-panel` (`Done`) — [`docs-panel.md`](../shared/docs-panel.md), "Interface" — `DocsPanel` bound to `slug="messages-console"`. New doc content authored via `write-lab-doc` once this feature is built, not part of this plan.
- `api-error-handling` (`Done`) — [`api-error-handling.md`](../shared/api-error-handling.md), "Using it" — the streaming path's own `shapeError()` call for a terminal `event: error` frame, since the global exception filter can't intercept an already-streaming response.
- `app-shell` (`Done`) — [`app-shell.md`](../shared/app-shell.md), "Interface" — `FEATURE_ROUTES` registration at index 0.

## Contract

Two independent tracks — backend (route/service) and frontend (component) — pinned here so either can be built and tested against this alone.

**`POST /api/messages-console/turn`** — request body:
```ts
{
  modelChoice: 'default' | 'classification' | 'hardest-call';
  systemPrompt?: string;
  temperature?: number;              // 0–1
  messages: { role: 'user' | 'assistant'; text: string }[];  // non-empty
  stream: boolean;
}
```
- Validation failure (bad `temperature` range, empty `messages`, invalid `modelChoice`) → plain Nest `400` via the validation pipe — not the `{ error: { message, source } }` shape, which is reserved for a Claude-API/app failure.
- `stream: false` → `200` with body `TurnEnvelope` (from `envelope-builder`): `{ request, response, usage, stopReason }`. No `calls` field — this route never makes more than one Messages API call per turn.
- `stream: true` → `Content-Type: text/event-stream` on the same route. Each raw Claude stream event forwarded verbatim as `event: <type>\ndata: <json>\n\n`. Response content is reconstructed lab-locally from `content_block_delta` events (`message_start`'s own `content` is always `[]` in real streaming) into a synthetic response object, then passed through `EnvelopeBuilderService.build()` for the final envelope — this reconstruction logic stays in this feature's own service, not `envelope-builder`, per that task's own note on waiting for a second streaming consumer. Stream ends with one `event: turn_complete\ndata: <TurnEnvelope JSON>\n\n`.
- A failure mid-stream → `event: error\ndata: <ShapedError body JSON>\n\n`, no `turn_complete` after it. A failure on a non-streaming request → the global filter's normal `502`/`500` handling, per `api-error-handling.md`.

**Frontend:** `frontend/src/app/messages-console/messages-console.ts` + `.html`, moved from `foundations-console.ts`'s existing transcript-only signals/logic (`messages`, `draftMessage`, `systemPrompt`, `temperature`, `streamingEnabled`, `displayMessages`, the `fetch()`-based SSE reader loop, `parseSseFrame`, `extractResponseText`) — unchanged behavior, calling the new route above and using `<app-model-picker>` in place of the inline `<select>`.

## Test scenarios

**Automated:**
- [ ] Non-streaming: a valid request returns `200` with a `TurnEnvelope` built via `EnvelopeBuilderService`.
- [ ] Streaming: a valid `stream: true` request forwards raw events and ends with `turn_complete` carrying the envelope reconstructed from `content_block_delta` events.
- [ ] An invalid body (bad `temperature`, empty `messages`, invalid `modelChoice`) returns a plain `400`, not the `{ error }` shape.
- [ ] A Claude API failure mid-stream emits a terminal `event: error` frame shaped via `shapeError()`, with no `turn_complete` after it.
- [ ] A Claude API failure on a non-streaming request returns `502` with `{ error: { message, source: 'anthropic' } }`.
- [ ] (Frontend) Sending a message renders it right-aligned; the assistant's reply renders left-aligned once received.
- [ ] (Frontend) In streaming mode, the assistant's text appends incrementally as `content_block_delta` events arrive.
- [ ] (Frontend) The inspector panel reflects the completed turn's request/response/usage/stopReason.
- [ ] (Frontend) A failed request or stream shows a visible error state, not a silent failure.

**Manual:**
1. Run `docker compose -f docker-compose.dev.yml up`. Open the app — it should land on Messages Console (the new first nav entry / root redirect).
2. Pick a model, enter a system prompt and a message, send it with streaming off — confirm the reply renders and the inspector shows the request/response/usage.
3. Toggle streaming on, send another message — confirm the reply streams in incrementally and the inspector's stream-events log populates, ending with the same final usage/stopReason display as step 2.

## To-do list

**Backend:**
- [ ] Create `backend/src/messages-console/` (controller, service, module, `dto/send-message.dto.ts`), moved from `foundations-console`'s existing transcript-only code (`sendMessage`, `createTurn`, `streamTurn`, `buildMessageParams`, `accumulateStreamedContent`, `buildEnvelopeFromEvents`), with the local `buildEnvelope` method replaced by a call to `EnvelopeBuilderService.build()`.
- [ ] Wire `MessagesConsoleModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`) into `AppModule`.
- [ ] Add `messages-console.service.spec.ts` / `messages-console.e2e-spec.ts` covering the backend Test scenarios above.

**Frontend:**
- [ ] Create `frontend/src/app/messages-console/messages-console.ts` + `.html` per "Contract" above, using `<app-model-picker>`, `<app-docs-panel slug="messages-console">`, and `<app-inspector-panel>`.
- [ ] Register `{ slug: 'messages-console', label: 'Messages Console', loadComponent: ... }` as index `0` in `FEATURE_ROUTES`.
- [ ] Add `messages-console.spec.ts` covering the frontend Test scenarios above.
- [ ] Once built, run `write-lab-doc` against this lab to author `frontend/public/lab-docs/messages-console.md`.
