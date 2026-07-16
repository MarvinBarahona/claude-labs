# Feature — Live Tool-Use Console

**Status:** 📋 Planned.

**Nav position:** last (after `structured-output-console`, the current last entry in `FEATURE_ROUTES`).

**Depends on:**
- [`task-github-provider.md`](task-github-provider.md) — `GithubClient`'s "Interface" section (`getIssues`/`getCommits`/`getReleases` methods and their typed return shapes). This feature is that task's first consumer.
- [`inspector-panel.md`](../shared/inspector-panel.md), "Interface" section — the `InspectorCall` shape and its generic per-block-type content rendering (already covers `tool_use`/`tool_result` blocks with no per-feature variant needed). See "Shared-component change needed" below — this feature is the first consumer needing the `calls` field `architecture.md` defines, which `InspectorCall` doesn't carry yet.
- [`model-config.md`](../shared/model-config.md), "Interface" section — `ModelConfigService.getModel(tier)`.
- [`model-picker.md`](../shared/model-picker.md) — the `ModelPicker` component and its `ModelChoice` type.
- [`envelope-builder.md`](../shared/envelope-builder.md), "Interface" section — `EnvelopeBuilderService.build()` for the final call's `TurnEnvelope` skeleton.
- [`api-error-handling.md`](../shared/api-error-handling.md), "Interface" section — `ExternalApiError`/`shapeError()` for the transport-error path (distinct from a tool's own `is_error: true` result — see "Tool failure vs. transport failure" below).
- [`app-shell.md`](../shared/app-shell.md), "Lab page composition convention" section (docs → demo → inspector stacking) and "Using it" section (`FEATURE_ROUTES` registration mechanic).
- [`docs-panel.md`](../shared/docs-panel.md), "Using it" section — `<app-docs-panel [slug]="'live-tool-use-console'" />`.
- [`architecture.md`](../technical/architecture.md) — "Custom tools vs. server-executed tools" (the tool-use loop mechanic), "Streaming transport" (the two app-level tool-call event types), "Request/response contract" (the `calls` field for multi-call turns), "Error contract" (tool failure vs. transport failure).
- [`test-doubles.md`](../shared/test-doubles.md) — Open-Meteo is one of the data sources this file's "Data-source fakes" bullet already anticipates; this feature adds that fake.

## Claude API features

- **Custom tool definitions** — described to Claude via a JSON Schema `input_schema`; use descriptive function/parameter names (Claude reads them to decide when/how to call the tool) and return clear validation-error messages so Claude can self-correct and retry.
- **Tool-use/tool-result loop** — Claude signals `stop_reason: "tool_use"` and returns one or more `tool_use` blocks (`id`, `name`, `input`); the app runs the real function(s) and replies with a `tool_result` block per call (matching `tool_use_id`), batching all of them into a single new `user` message; repeat until `stop_reason != "tool_use"`.
- **Fine-grained (eager) tool-argument streaming** — by default, streamed tool-argument JSON is buffered per top-level field then delivered in bursts (each burst is schema-valid); setting `eager_input_streaming: true` on a tool definition delivers chunks as soon as Claude generates them, at the cost of the app having to tolerate incomplete/invalid JSON mid-stream.

## Main idea

Claude answers one free-form question per turn (no running chat history — this feature demonstrates the tool-loop mechanic, not multi-turn memory) by choosing between two independent custom tools: `get_weather` (real-time weather for a named location) and `get_repo_stats` (open-issue count, latest commit, latest release for the subject GitHub repo). Demonstrates the full request → `tool_use` → `tool_result` → final-answer loop, multi-tool selection, and streaming tool arguments as they're generated. No system prompt is sent — each tool's own `input_schema`/description is enough for Claude to decide when to use it.

## Dataset & env vars

Two independent sources:

- **Open-Meteo** (`api.open-meteo.com`, plus its Geocoding API at `geocoding-api.open-meteo.com`) — no auth required. Backs `get_weather`: geocode the location name to latitude/longitude (`GET /v1/search?name=<location>&count=1`), then fetch current conditions (`GET /v1/forecast?latitude=..&longitude=..&current=temperature_2m,weather_code`). A small fixed WMO weather-code → short description lookup table covers the common codes; an unmapped code falls back to displaying the raw numeric code as its own description.
- **GitHub REST API** (`api.github.com`) — backs `get_repo_stats`, via the shared GitHub data provider (see Depends on). Uses `GITHUB_TARGET_REPO` (default `angular/angular`) and, optionally, `GITHUB_TOKEN`.

No new env vars — both sources' config already exists (`env-config.md`).

## Shared-component change needed

`InspectorPanel`'s current `InspectorCall` (`inspector-panel.md`) has no `calls` field, because no feature built so far has a multi-call turn. This feature is the first one that does (a tool loop can take several Messages API calls in one turn), and `architecture.md`'s "Request/response contract" already specifies `calls` as part of the shared envelope shape. This is a small, mechanical extension of the existing Done component — not separable scope worth its own task — so it's part of this feature's own to-do list: add an optional `calls?: readonly { request: unknown; response: unknown }[]` input to `InspectorCall`, rendered as a list of prior request/response pairs above the final call's existing display, reusing the same generic opaque-JSON rendering already used for `request`/`response`. Update `inspector-panel.md`'s permanent doc (and its `.spec.ts`) to describe the addition once built, per this repo's shared-doc maintenance convention.

## Tool failure vs. transport failure

Per `architecture.md`'s "Error contract": a tool's own logical failure is not a transport error. A location name that `get_weather`'s geocoding lookup can't resolve returns a `tool_result` with `is_error: true` and a clear message (e.g. `No location found matching "<location>"`), letting Claude see the failure and retry or explain it to the user — it never throws. By contrast, an actual `ExternalApiError` from either data source's own client (Open-Meteo unreachable/5xx, or `GithubClient` throwing per `task-github-provider.md`) is a genuine transport failure — it propagates uncaught out of the tool-loop code to the same `502`/mid-stream `event: error` path every other lab already uses, per `api-error-handling.md`. The tool-execution code only ever wraps the *first* kind (a well-formed call that legitimately finds nothing) into `is_error: true`; it never swallows the second kind into a fake success.

## Independent implementation tracks

**Contract** (frontend and backend can be built/tested against this alone):

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

Non-streaming (`stream: false`) success → `200`:
```ts
TurnEnvelope & { calls?: { request: AnthropicMessageParams; response: AnthropicMessage }[] }
```
`TurnEnvelope` (`envelope-builder.md`) is built from the loop's *final* call (the one whose `stop_reason` isn't `tool_use`). `calls` carries every earlier `{ request, response }` pair from the same turn, in order, and is omitted entirely when Claude answered without using a tool (a single-call turn) — matching `architecture.md`'s "omitted for a single-call turn" rule.

Streaming (`stream: true`) → `200`, `Content-Type: text/event-stream`, same route:
- Each raw Claude stream event forwarded verbatim as `event: <type>\ndata: <json>\n\n`.
- Two app-level events bracket each backend-executed tool call: `event: tool_call_start\ndata: {"name": string, "input": unknown}\n\n` right before the function runs, `event: tool_call_result\ndata: {"name": string, "result": unknown, "isError": boolean}\n\n` right after.
- Terminal event: `event: turn_complete\ndata: <same JSON body as the non-streaming success above>\n\n`.
- A transport-level failure (see "Tool failure vs. transport failure" above) mid-stream → `event: error\ndata: <ShapedError body JSON>\n\n`, no `turn_complete` after it.

Tool definitions (both custom, backend-executed, both offered on every call):
- `get_weather` — `input_schema: { type: 'object', properties: { location: { type: 'string', description: 'City or place name, e.g. "Tokyo" or "San Francisco, CA"' } }, required: ['location'] }`.
- `get_repo_stats` — `input_schema: { type: 'object', properties: {}, additionalProperties: false }` (no arguments — always reports on the configured target repo). Result shape: `{ openIssueCount: number; latestCommit: { sha: string; message: string; date: string } | null; latestRelease: { tagName: string; publishedAt: string } | null }`, built from `GithubClient.getIssues({ state: 'open' })`/`getCommits()`/`getReleases()`.

## Build order & dependencies

Right after the GitHub data provider exists (see `status.md` for current position).

- Requires the App Shell's shared chrome (inspector panel, docs panel, model picker, config/model layer) to already exist — Messages Console and Structured Output Console are the existing examples of this composition, not a dependency of their own.
- Requires the **GitHub data provider** ([`task-github-provider.md`](task-github-provider.md)) to already exist — this feature is the provider's first consumer.
- Introduces the tool-use/tool-loop pattern that Workflow Gallery (built right after this one) and Agent Playground (last) both reuse.

## Frontend

`frontend/src/app/live-tool-use-console/` (`LiveToolUseConsole`). Stacks `<app-docs-panel [slug]="'live-tool-use-console'" />` → the demo (`<app-model-picker>`, a free-text question input, a streaming toggle, an Ask button, the rendered final answer text, and a live tool-activity list showing each tool call as it starts/resolves) → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention.

- Non-streaming: `HttpClient` POST, response mapped straight into the `InspectorCall` (including its new `calls` field).
- Streaming: `fetch()` with a manual `ReadableStream` reader parsing `event:`/`data:` SSE frames (same approach as Messages Console) — `tool_call_start`/`tool_call_result` frames append to the tool-activity list live as they arrive, raw Claude events accumulate the final answer text, and `turn_complete` applies the final envelope (including `calls`) to the inspector panel. A mid-stream `error` frame surfaces its `message` as a visible error state.

## Files API / base64

Not applicable — no documents or images in this feature.

## Test scenarios

### Automated

**Backend unit** (fake `AnthropicClient`, `GithubClient`, and a fake `OpenMeteoClient` bound via DI):
- A question Claude answers without any tool call → single-call `TurnEnvelope`, no `calls` field.
- A question resolved via one `get_weather` call → the loop runs a second Messages API call with a matching `tool_result`, and the response's `calls` array holds the first `{ request, response }` pair.
- A question resolved via one `get_repo_stats` call → same loop shape, using `GithubClient`'s injected methods.
- A question needing both tools in sequence → `calls` holds every earlier pair in order, final envelope built from the last call.
- `get_weather` with a location the fake geocoder can't resolve → a `tool_result` block with `is_error: true` and a clear message, loop continues (no thrown exception).
- `GithubClient` throwing `ExternalApiError('github', ...)` mid-loop → propagates uncaught, not swallowed into a tool result.
- Invalid request body (empty `question`, bad `modelChoice`) → `400`.

**Backend integration** (`nock` intercepting the real Anthropic/GitHub/Open-Meteo HTTP calls):
- End-to-end non-streaming turn exercising both tools once each, asserting the final `200` body shape (including `calls`).
- End-to-end streaming turn asserting the SSE frame sequence: raw Claude events, `tool_call_start`/`tool_call_result` pairs, `turn_complete`.
- A `502` from a genuine Open-Meteo/GitHub failure surfaces via the shared `{ error: { message, source } }` shape (non-streaming) and via a mid-stream `error` frame (streaming).

**Frontend unit** (`HttpTestingController`, fake SSE frames):
- Non-streaming: Ask renders the final answer text and the completed inspector call including `calls`.
- Streaming: tool-activity entries appear live as `tool_call_start`/`tool_call_result` frames arrive, final answer text accumulates from raw content-delta events, inspector panel updates on `turn_complete`.
- A mid-stream `error` frame surfaces a visible error state.
- Invalid/empty question input is prevented from submitting (or surfaces the `400` as a visible error, matching the other consoles' convention).

**Shared component** (`inspector-panel.spec.ts`, extended):
- A `calls` input renders each prior `{ request, response }` pair, in order, above the final call's existing display, using the same generic JSON rendering as `request`/`response`.
- `calls` omitted (or empty) renders exactly as today (regression check).

### Manual

1. With the dev stack running (`docker compose -f docker-compose.dev.yml up`), open Live Tool-Use Console and ask a weather question for a real city (e.g. "What's the weather in Tokyo?"). Expect: the tool-activity list shows `get_weather` starting and resolving, then a final answer describing current conditions.
2. Ask a repo-stats question (e.g. "How many open issues does the repo have?"). Expect: `get_repo_stats` runs, and the final answer reflects real data for the configured target repo.
3. Ask a question needing both tools in one turn (e.g. "What's the weather in Paris, and how many open issues are there in the repo?"). Expect: both tools run in the tool-activity list, and the inspector panel's `calls` section shows more than one prior request/response pair.
4. Toggle streaming on and repeat scenario 1. Expect: tool-activity entries appear live as the turn progresses, not only after the final answer lands.
5. Ask about an unresolvable location (e.g. "weather in Qwxzplace"). Expect: a visible, non-crashing answer acknowledging the location couldn't be found — not a raw error banner.

## To-do list

- [ ] Add `github-provider`'s `GithubClient`-backed tool function for `get_repo_stats` (assumes `task-github-provider.md` is already built).
- [ ] Add lab-local `OpenMeteoClient` abstract-class DI token + `RealOpenMeteoClient` (geocode-then-forecast, `axios`) at `backend/src/live-tool-use-console/` (lab-local per `repo-layout.md` — only this lab consumes it today), and `FakeOpenMeteoClient` at `backend/src/testing/open-meteo/`, exported from `backend/src/testing/index.ts`.
- [ ] Add `backend/src/testing/http-fixtures/open-meteo.fixtures.ts` — `nock` fixtures for geocoding + forecast success and a not-found geocoding result.
- [ ] Implement the tool-loop controller/service: both tool definitions, the loop (repeat on `stop_reason: "tool_use"` until it isn't), `is_error: true` tool results for a resolvable-but-not-found lookup, uncaught propagation for a genuine `ExternalApiError`.
- [ ] Implement streaming: forward raw Claude events, emit `tool_call_start`/`tool_call_result` around each executed tool call, end with `turn_complete`; `shapeError()` into a mid-stream `error` frame on a transport failure.
- [ ] Extend `InspectorPanel`'s `InspectorCall` with the optional `calls` field and its rendering; update `inspector-panel.md` and its spec once built.
- [ ] Build `LiveToolUseConsole` frontend component per the composition above, both streaming and non-streaming paths.
- [ ] Register `live-tool-use-console` in `FEATURE_ROUTES` (`feature-registry.ts`) as the last entry.
- [ ] Add `LAB_CATALOG['live-tool-use-console']` entry (`lab-catalog.ts`) so it appears in the Home Page lab index.
- [ ] Write the automated test scenarios above.
- [ ] Hand the manual test scenarios above to the user to run once implementation is complete.

## Open questions

None.
