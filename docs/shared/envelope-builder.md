# Response Envelope Builder

A small shared backend helper that turns a Messages API call's `params`/`response` pair into this app's standard inspector envelope — `{ request, response, usage, stopReason }`, with `usage`'s fields mapped from the SDK's snake_case to this app's camelCase, per `architecture.md`'s "Request/response contract" section. Every lab's backend endpoint produces exactly this shape when it makes a Messages API call.

Deliberately narrow: only the `{ request, response, usage, stopReason }` skeleton every lab always produces. The optional `calls` (multi-call turns) and `cache` (cache read/write status) fields `architecture.md` also defines are assembled by whichever lab actually has a tool loop or places a cache breakpoint — not part of this module. Model-tier resolution (`ModelConfigService.getModel(choice)`, see `model-config.md`) is a separate one-line delegation, also not part of this module.

Streaming's own envelope reconstruction (turning raw SSE events back into a `Message`-shaped response before calling `build()` below) is not part of this module — see [`stream-response-builder.md`](stream-response-builder.md) for that; a streaming consumer calls `StreamResponseBuilderService.reconstructMessage()` first and passes its result into `build()` here.

## Interface

`backend/src/shared/envelope-builder/`:

- **`envelope-builder.types.ts`** — `TurnUsage` (`{ inputTokens: number; outputTokens: number; cacheCreationInputTokens?: number; cacheReadInputTokens?: number }`) and `TurnEnvelope` (`{ request: AnthropicMessageParams; response: AnthropicMessage; usage: TurnUsage; stopReason: string | null }`).
- **`envelope-builder.service.ts`** — `EnvelopeBuilderService.build(params: AnthropicMessageParams, response: AnthropicMessage): TurnEnvelope`. Maps `response.usage.input_tokens`/`output_tokens` to `usage.inputTokens`/`outputTokens`; maps `response.usage.cache_creation_input_tokens`/`cache_read_input_tokens` to `usage.cacheCreationInputTokens`/`cacheReadInputTokens`, `undefined` (never `0`) when the SDK didn't return them; copies `response.stop_reason` to `stopReason` unchanged, including `null`; passes `params`/`response` through as `request`/`response` unmutated.
- **`envelope-builder.module.ts`** — `EnvelopeBuilderModule` (`providers: [EnvelopeBuilderService], exports: [EnvelopeBuilderService]`).

## Using it

Import `EnvelopeBuilderModule` into a feature module and inject `EnvelopeBuilderService`. Call `build(params, response)` right after a `createMessage()` call (or, for a streaming consumer, after reconstructing a `Message`-shaped response from the accumulated stream events) to get the envelope shape the inspector expects.

## Testing

- `backend/src/shared/envelope-builder/envelope-builder.service.spec.ts` — covers the cache-fields-absent (`undefined`, not `0`) case, the cache-fields-present mapping, `stopReason` passthrough including `null`, and that `request`/`response` come back as the exact same values passed in (no reshaping or mutation).
