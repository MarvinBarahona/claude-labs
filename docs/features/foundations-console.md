# Feature — Foundations Console

**Nav position:** first.

A raw Claude Messages API explorer: two independent demo interactions on one page — a running message transcript and a structured (JSON-schema) output demo — sharing one model picker, backed by the shared Anthropic client, inspector panel, docs panel, and model-config layer.

## Interface

- **`POST /api/foundations-console/messages`** — the transcript turn. Body: `{ modelChoice: 'default' | 'classification' | 'hardest-call'; systemPrompt?: string; temperature?: number; messages: { role: 'user' | 'assistant'; text: string }[]; stream: boolean }` (`modelChoice` resolves via [`model-config.md`](../shared/model-config.md)'s `ModelConfigService.getModel(tier)`, labeled Sonnet/Haiku/Opus in the UI). Validation errors (bad `temperature` range, empty `messages`, invalid `modelChoice`) return a plain `400` via Nest's validation pipe, not the app's `{ error: { message, source } }` shape, which is reserved for a Claude-API/data-source/app failure (see [`architecture.md`](../technical/architecture.md)'s "Error contract"). Non-streaming (`stream: false`) returns one envelope `{ request, response, usage, stopReason }`, no `calls` array since this route makes exactly one call. Streaming (`stream: true`) responds `text/event-stream` on the same route: each raw Claude event is forwarded verbatim, named by its own `type`, ending with one terminal `event: turn_complete` carrying the same envelope shape — its `response.content` is reconstructed server-side from the stream's `content_block_delta` events, since `message_start`'s own `content` is always empty in real streaming.
- **`POST /api/foundations-console/structured`** — the structured-output demo. Body: `{ modelChoice; input: string }`. A single blocking call through the same `AnthropicClient.createMessage()` used above, with `output_config: {format: {type: "json_schema", schema}}` set to a fixed, hardcoded demo schema (`{ summary: string; sentiment: 'positive' | 'neutral' | 'negative'; actionItems: string[] }`) — not user-editable, and not the SDK's own `client.messages.parse()` convenience wrapper, which would bypass the shared [`anthropic-client.md`](../shared/anthropic-client.md) token. Response is the same envelope shape plus a sibling `parsed` field holding the `JSON.parse()`d result.

## Frontend

`frontend/src/app/foundations-console/foundations-console.ts`, registered as the first entry in `FEATURE_ROUTES` (`frontend/src/app/core/feature-registry.ts`). Two peer sections beneath the shared docs panel: "Transcript" (model picker, system-prompt textarea, temperature slider, streaming toggle, and a chat-style running transcript — user messages right-aligned, assistant messages left-aligned) and "Structured output demo" (free-text input, parsed `summary`/`sentiment`/`actionItems` result). Both sections share the same model-picker selection; a shared `<app-inspector-panel>` below always reflects whichever of the two actions most recently completed. Streaming is parsed from a raw `fetch()` body reader, never `EventSource` (which can't carry this route's POST body).

## Testing

- `foundations-console.service.spec.ts` — unit tests with a fake `AnthropicClient` bound via DI, covering both routes' request/response shaping, including the streaming path's terminal `turn-complete`/`error` frame and its `content` reconstruction from delta events.
- `foundations-console.e2e-spec.ts` — integration tests with `nock` intercepting the real SDK's outbound call, including the `400` validation-error path.
- `foundations-console.spec.ts` (frontend) — unit tests with `HttpTestingController`, covering both demo interactions and the streaming SSE-parsing path. No frontend-integration test (real backend process, fake client bound) exists yet for this feature — see `testing-strategy.md`.
