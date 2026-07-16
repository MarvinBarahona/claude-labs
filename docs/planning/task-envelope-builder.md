# Task — Response Envelope Builder

**Status:** 📋 Planned.

## Description

A small shared backend helper that turns a Messages API call's `params`/`response` pair into this app's standard inspector envelope — `{ request, response, usage, stopReason }`, with `usage`'s fields mapped from the SDK's snake_case to this app's camelCase, per `architecture.md`'s "Request/response contract" section. Every lab's backend endpoint has to produce exactly this shape; today the only implementation of it (`buildEnvelope()` in `foundations-console.service.ts`) lives inside that one lab's own service, which was correct while only one lab existed (`repo-layout.md`'s "Lab-specific, or shared functionality?" rule).

Splitting Foundations Console into Messages Console and Structured Output Console (see `task-retire-foundations-console.md`) means two lab areas now need this exact same mapping at once — the textbook trigger `repo-layout.md` names for promotion: "the moment a second lab needs the same thing, it's promoted into a shared module... instead of being copied." This task does that promotion, moving the existing logic (unchanged) into its own shared module rather than duplicating it into both new lab services.

Deliberately narrow: only the `{ request, response, usage, stopReason }` skeleton every lab always produces. The optional `calls` (multi-call turns) and `cache` (cache read/write status) fields `architecture.md` also defines stay assembled by whichever lab actually has a tool loop or places a cache breakpoint — Messages Console and Structured Output Console don't use either, so this task has no opinion on them yet. Model-tier resolution (`ModelConfigService.getModel(choice)`) is already a one-line delegation to an existing shared module and doesn't need its own wrapper here.

Streaming's own envelope reconstruction (`accumulateStreamedContent`/`buildEnvelopeFromEvents` in the current `foundations-console.service.ts`) stays lab-local to `feature-messages-console.md` rather than moving here — it's the only consumer that streams, so promoting it now would be speculative ahead of a real second streaming consumer, the same "wait for a second consumer" reasoning this task itself was just promoted under. Its final step still calls this task's `build()` (below) once the response is reconstructed, so the two pieces compose rather than duplicate.

## Interface

`backend/src/shared/envelope-builder/`:

- **`envelope-builder.types.ts`** — `TurnUsage` (`{ inputTokens: number; outputTokens: number; cacheCreationInputTokens?: number; cacheReadInputTokens?: number }`) and `TurnEnvelope` (`{ request: AnthropicMessageParams; response: AnthropicMessage; usage: TurnUsage; stopReason: string | null }`), replacing `foundations-console.service.ts`'s current lab-local `MessagesEnvelope`/`TurnUsage` types.
- **`envelope-builder.service.ts`** — `EnvelopeBuilderService.build(params: AnthropicMessageParams, response: AnthropicMessage): TurnEnvelope`, moved verbatim from `foundations-console.service.ts`'s existing private `buildEnvelope` method (same field mapping, no behavior change).
- **`envelope-builder.module.ts`** — `EnvelopeBuilderModule` (`providers: [EnvelopeBuilderService], exports: [EnvelopeBuilderService]`).

## Depends on

- `anthropic-client` (`Done`) — [`anthropic-client.md`](../shared/anthropic-client.md), "Interface" — the `AnthropicMessage`/`AnthropicMessageParams` types `build()`'s signature is built against.
- `architecture.md`, "Request/response contract (the inspector's data shape)" — the exact envelope shape this task implements.

## Test scenarios

**Automated:**
- [ ] A typical response (only `input_tokens`/`output_tokens` on `usage`, no cache fields) → `build()` returns `usage.cacheCreationInputTokens`/`usage.cacheReadInputTokens` as `undefined`, not `0`.
- [ ] A response whose `usage` includes `cache_creation_input_tokens`/`cache_read_input_tokens` → both map to their camelCase `TurnEnvelope.usage` fields.
- [ ] `stopReason` reflects `response.stop_reason` unchanged, including when it's `null`.
- [ ] `request`/`response` on the returned envelope are the exact same values passed in (passthrough, never reshaped or mutated).

No manual scenarios — pure backend logic, no UI or running-app surface of its own.

## To-do list

- [ ] Create `backend/src/shared/envelope-builder/envelope-builder.types.ts` (`TurnUsage`, `TurnEnvelope`) per "Interface" above.
- [ ] Create `backend/src/shared/envelope-builder/envelope-builder.service.ts` (`EnvelopeBuilderService.build()`), moved verbatim from `foundations-console.service.ts`'s existing `buildEnvelope` method.
- [ ] Create `backend/src/shared/envelope-builder/envelope-builder.module.ts` (`EnvelopeBuilderModule`).
- [ ] Add `backend/src/shared/envelope-builder/envelope-builder.service.spec.ts` covering the Test scenarios above.
