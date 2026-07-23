# Inspector Panel

The shared "raw payload" panel visible in every feature: request JSON, response JSON, streaming event log, `stop_reason`, token `usage`, and cache read/write status per call — so the underlying API mechanics are never hidden behind a feature's demo UI.

## Interface

`InspectorPanel` (`frontend/src/app/shared/inspector-panel/inspector-panel.ts`, selector `app-inspector-panel`) takes a required `call` input — `input.required<InspectorCall>()` (`inspector-call.ts`) — plus an optional `title` input (`input('Inspector')`), for a lab that stacks more than one instance on the same page (e.g. Extended Thinking Bench's 3 comparison runs) and needs to tell them apart; a lab with a single instance never needs to pass it:

```ts
interface InspectorCall {
  request: unknown;
  response?: unknown;
  streamEvents?: readonly unknown[];
  calls?: readonly { request: unknown; response: unknown }[];
  stopReason?: string | null;
  usage?: InspectorUsage;
}

interface InspectorUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}
```

- `request`/`response` are passed through opaque and rendered as pretty-printed JSON only — never field-accessed, so any Claude API request/response shape works without a per-feature inspector variant.
- `stopReason` and `usage` are camelCase fields a backend module maps from the Claude API's snake_case response before shaping its payload for the frontend.
- `streamEvents` renders incrementally: a caller replaces it wholesale with a new array reference as events arrive (e.g. appending to a signal-held array) — `OnPush` change detection picks up the new input each time, with no internal event buffer of the component's own.
- `calls` holds the earlier request/response pairs of a multi-call turn (e.g. a tool-use round trip), in chronological order, ahead of the final `request`/`response` pair — each pair is rendered opaque as pretty-printed JSON with no field access, the same as the final call, and appears above the final call's Request/Response grid so reading order matches turn chronology.
- Content blocks are read from `response.content` (an array, when present) and rendered generically — one loop keyed on each block's own `type` field, no per-block-type template branching. This already covers `text`, `tool_use`, and `tool_result` blocks without special-casing.
- Cache status: a cache write is shown when `usage.cacheCreationInputTokens > 0`, a cache read when `usage.cacheReadInputTokens > 0` — both can render at once, labeled distinctly.

## Using it

Import `InspectorPanel` and bind `[call]` to an `InspectorCall` your feature's backend response payload was shaped into. No per-feature inspector variant is needed — shape the response payload to the contract above and the same component renders it.

## Potential other uses

Because it already captures one call's full request/response, it's a natural place to add a "replay this call" action later (re-send the exact captured request) or a running per-session call history (useful once multi-turn features like Document Research Assistant make more than one call worth comparing) — neither committed now, just noted since the component's data shape already supports it.

## Testing

`frontend/src/app/shared/inspector-panel/inspector-panel.spec.ts` covers: static rendering of a non-streaming request/response pair (request/response JSON, `stop_reason`, `usage`); the no-response-yet placeholder; incremental streaming-event rendering in order; distinct cache read/write display; generic content-block rendering across `text`/`tool_use`/`tool_result` blocks; rendering each prior call in `calls` in order above the final call; a regression check that an omitted/empty `calls` renders exactly as before; and the `title` input defaulting to "Inspector" and reflecting a custom value when passed.
