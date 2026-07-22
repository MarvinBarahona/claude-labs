# Stream Response Builder

A small shared backend module that reconstructs a full `Message`-shaped response from a streamed call's raw SSE events, exhaustively over the SDK's known `content_block_delta` kinds. Every lab that streams composes this with `EnvelopeBuilderService.build()` (see `envelope-builder.md`) as the final step of turning a stream into the same `TurnEnvelope` shape a non-streaming call already produces.

## Interface

`backend/src/shared/stream-response-builder/`:

- **`stream-response-builder.service.ts`** — `StreamResponseBuilderService.reconstructMessage(events: readonly AnthropicStreamEvent[]): AnthropicMessage`. Finds the `message_start` event (throws `Error('Streamed response completed without a message_start event')` if none is present); finds the `message_delta` event, if any, and merges its `stop_reason`/`stop_sequence`/`usage` onto `message_start`'s own message, each `usage` field falling back to `message_start`'s own value when `message_delta` doesn't carry it. Accumulates content blocks by index from `content_block_start`/`content_block_delta`/`content_block_stop` events: `text_delta`, `thinking_delta`, `signature_delta`, and `citations_delta` each append to their matching block's field; `input_json_delta` accumulates a `tool_use` block's input as a JSON string, parsed (`{}` when empty) once its `content_block_stop` arrives. The delta-kind switch is exhaustive over the SDK's own `content_block_delta` union via a `default` arm that binds the unmatched delta to a `never`-typed variable and throws at runtime too — a delta kind the SDK's union doesn't declare yet is a build failure here, not a silently-dropped field.
- **`stream-response-builder.module.ts`** — `StreamResponseBuilderModule` (`providers: [StreamResponseBuilderService], exports: [StreamResponseBuilderService]`). No constructor dependencies — pure function over an event array.

## Using it

Import `StreamResponseBuilderModule` into a feature module and inject `StreamResponseBuilderService`. Call `reconstructMessage(events)` once a stream ends, then pass its result into `EnvelopeBuilderService.build()` (see `envelope-builder.md`) to get the same `TurnEnvelope` shape a non-streaming call produces.

## Testing

- `backend/src/shared/stream-response-builder/stream-response-builder.service.spec.ts` — covers `text_delta`, `input_json_delta` (including the empty-arguments `input: {}` case), `thinking_delta`/`signature_delta`, and `citations_delta` accumulation; the `message_delta` merge including its usage-field fallback to `message_start`'s own value; the missing-`message_start` throw; and an unrecognized `content_block_delta` kind (constructed via a cast bypassing the real union) throwing at runtime, proving the exhaustiveness guard fires beyond just compiling.
