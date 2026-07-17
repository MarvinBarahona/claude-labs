# Live Tool-Use Console

A tool-use demo: free-text question, a model picker, a streaming toggle, and Claude choosing between two independent backend-executed tools — `get_weather` (real-time conditions for a named location) and `get_repo_stats` (open-issue count, latest commit, latest release for the configured GitHub repo). Demonstrates the full request → `tool_use` → `tool_result` → final-answer loop, multi-tool selection in one turn, and fine-grained (eager) streaming of tool arguments as Claude generates them.

## Backend

`POST /api/live-tool-use-console/turn` (`backend/src/live-tool-use-console/`):

Request body:
```ts
{
  modelChoice: 'default' | 'classification' | 'hardest-call';
  question: string;  // non-empty
  stream: boolean;
}
```

- Validation failure (empty `question`, invalid `modelChoice`) → plain Nest `400` via the validation pipe.
- Non-streaming (`stream: false`) success → `200` with body `TurnEnvelope & { calls?: { request: AnthropicMessageParams; response: AnthropicMessage }[] }`. `TurnEnvelope` (`envelope-builder.md`) is built from the loop's *final* call (the one whose `stop_reason` isn't `tool_use`); `calls` carries every earlier `{ request, response }` pair from the same turn, in order, omitted entirely when Claude answered without using a tool.
- Streaming (`stream: true`) → `200`, `Content-Type: text/event-stream`, same route: each raw Claude stream event forwarded verbatim as `event: <type>\ndata: <json>\n\n`; `event: tool_call_start\ndata: {"name": string, "input": unknown}\n\n` right before each backend-executed tool call runs, `event: tool_call_result\ndata: {"name": string, "result": unknown, "isError": boolean}\n\n` right after; a terminal `event: turn_complete\ndata: <same JSON body as the non-streaming success>\n\n`. A transport-level failure mid-stream instead emits `event: error\ndata: <ShapedError body JSON>\n\n`, with no `turn_complete` after it.
- `GET /api/live-tool-use-console/config` → `{ targetRepo: string }`, the configured `GITHUB_TARGET_REPO` — lets a caller name the actual repo `get_repo_stats` queries.

Both tools are offered on every call (both custom, backend-executed, no system prompt — each tool's own `description`/`input_schema` is enough for Claude to decide when to use it):

- `get_weather` — `input_schema: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] }`. Backed by a lab-local `OpenMeteoClient` (geocode-then-forecast against `api.open-meteo.com`, no auth). A location the geocoder can't resolve yields a `tool_result` with `is_error: true` and a clear message — a resolvable-but-not-found lookup, not a transport failure, so the loop continues rather than the call erroring out.
- `get_repo_stats` — `input_schema: { type: 'object', properties: {}, additionalProperties: false }` (no arguments — always reports on the configured target repo). Backed by the shared `GithubClient` (`getIssues`/`getCommits`/`getReleases`), returning `{ openIssueCount, latestCommit, latestRelease }`.

A genuine transport failure from either data source (an `ExternalApiError` from `OpenMeteoClient` or `GithubClient`) propagates uncaught to the same `502`/mid-stream `event: error` path every other lab uses — the tool-execution code only ever wraps a well-formed-but-empty lookup into `is_error: true`, never a real failure into a fake success.

Wired via `LiveToolUseConsoleModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `GithubProviderModule`) into `AppModule`.

## Frontend

`frontend/src/app/live-tool-use-console/` (`LiveToolUseConsole`). Stacks `<app-docs-panel [slug]="'live-tool-use-console'" />` → the demo (model picker, streaming toggle, free-text question input, Ask button, the rendered final answer, and a live tool-activity list showing each tool call as it starts/resolves) → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. The question placeholder names the actual configured target repo, fetched once from the config endpoint above.

- Non-streaming: `HttpClient` POST, response mapped into the `InspectorCall` (including its `calls` field).
- Streaming: `fetch()` with a manual `ReadableStream` reader parsing `event:`/`data:` SSE frames — `tool_call_start`/`tool_call_result` frames append to the tool-activity list live as they arrive, raw Claude content-delta events accumulate the final answer text, and `turn_complete` applies the final envelope (including `calls`) to the inspector panel. A mid-stream `error` frame surfaces its `message` as a visible error state.
- The Answer/Tool Activity sections stay mounted for at least 500ms after Ask is clicked (skeleton placeholders while empty) rather than blanking outright between a stale prior answer and the next one.

## In-app doc

`frontend/public/lab-docs/live-tool-use-console.md` — covers custom tool definitions, closing the tool-use/tool-result loop (including the `is_error` path), and eager tool-argument streaming alongside this lab's own SSE convenience events, rendered inline by `DocsPanel`.

## Testing

- `live-tool-use-console.service.spec.ts` — unit tests with a fake `AnthropicClient`, `GithubClient`, and `OpenMeteoClient` bound via DI: single-call and multi-call (`calls` populated) turns, both tools individually and in sequence, the `is_error` not-found path, and an `ExternalApiError` propagating uncaught mid-loop.
- `live-tool-use-console.e2e-spec.ts` — integration tests with `nock` intercepting the real Anthropic/GitHub/Open-Meteo HTTP calls: end-to-end non-streaming and streaming turns exercising both tools, the `GET /config` response, and `502`/mid-stream-`error` behavior on a genuine data-source failure.
- `live-tool-use-console.spec.ts` (frontend) — unit tests with `HttpTestingController` and fake SSE frames: non-streaming and streaming Ask flows, the target-repo placeholder, the Answer/Tool Activity skeletons holding for the minimum duration and never blanking on a second-onward ask, and the visible error state.
- `inspector-panel.spec.ts` (shared component, extended) — a `calls` input renders each prior `{ request, response }` pair, in order, above the final call's display; `calls` omitted or empty renders exactly as before.
