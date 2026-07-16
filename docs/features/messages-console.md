# Messages Console

A raw Claude Messages API explorer: model picker, system-prompt textarea, temperature slider, streaming toggle, and a chat-style running transcript. Demonstrates a plain multi-turn Messages API call, both streamed (Server-Sent Events) and non-streamed, including a system prompt and temperature control.

## Backend

`POST /api/messages-console/turn` (`backend/src/messages-console/`):

Request body:
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
- `stream: false` → `200` with body `TurnEnvelope` (from `envelope-builder`, see `envelope-builder.md`): `{ request, response, usage, stopReason }`. No `calls` field — this route never makes more than one Messages API call per turn.
- `stream: true` → `200` with `Content-Type: text/event-stream` on the same route. Each raw Claude stream event forwarded verbatim as `event: <type>\ndata: <json>\n\n`. Response content is reconstructed from `content_block_delta` events (`message_start`'s own `content` is always `[]` in real streaming) into a synthetic response object, then passed through `EnvelopeBuilderService.build()` for the final envelope. Stream ends with one `event: turn_complete\ndata: <TurnEnvelope JSON>\n\n`.
- A failure mid-stream → `event: error\ndata: <ShapedError body JSON>\n\n`, no `turn_complete` after it. A failure on a non-streaming request → the global filter's normal `502`/`500` handling, per `api-error-handling.md`.

Wired via `MessagesConsoleModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`) into `AppModule`.

## Frontend

`frontend/src/app/messages-console/` (`MessagesConsole`). Stacks `<app-docs-panel [slug]="'messages-console'" />` → the transcript demo (model picker, system prompt, temperature, streaming toggle, message list/input) → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. Uses the shared `<app-model-picker>` for model selection.

Calls the backend route above: non-streaming via `HttpClient`, streaming via `fetch()` with a manual `ReadableStream` reader parsing `event:`/`data:` SSE frames, accumulating `content_block_delta` text incrementally into the transcript and applying the final `TurnEnvelope` from `turn_complete` to the inspector panel. A mid-stream `error` frame surfaces its `message` as a visible error state.

## In-app doc

`frontend/public/lab-docs/messages-console.md` — covers the basic Messages API call shape and the SSE streaming event sequence, rendered inline by `DocsPanel`.
