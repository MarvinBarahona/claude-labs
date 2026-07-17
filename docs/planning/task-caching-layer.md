# Task — Caching Layer

**Status:** 📋 Planned.

## Purpose

A shared helper for placing and tracking prompt-caching breakpoints (system prompts, tool defs, long documents) so no feature hand-rolls its own cache-breakpoint logic. Encodes the mechanics once: processing always runs tools → system → messages, so a breakpoint caches everything before it too; minimum 1024 tokens to cache, up to 4 breakpoints per request, ~1-hour TTL; changing an earlier region invalidates every region after it, forcing a full-price reprocess.

## Interface

`backend/src/shared/caching-layer/`:

- **`caching-layer.types.ts`** — `CacheBoundary`, a discriminated union naming one point to attach a breakpoint:
  ```ts
  type CacheBoundary =
    | { region: 'tools' }
    | { region: 'system' }
    | { region: 'messages'; messageIndex: number };  // cache up through (and including) messages[messageIndex]'s last content block
  ```
  The `messages` variant (rather than a single flat `'messages'` region) is what lets a consumer place more than one breakpoint inside a growing conversation — e.g. one on a fetched document early in the history, a later one on the most recent prior turn — which is what "up to 4 breakpoints per request" actually means in practice, not 4 breakpoints spread one-per-top-level-region (there are only 3 of those).
- **`CachingLayerService`** (`caching-layer.service.ts`):
  - `markBreakpoints(params: AnthropicMessageParams, boundaries: CacheBoundary[]): AnthropicMessageParams` — returns a new params object (no mutation of the input) with `cache_control: { type: 'ephemeral' }` attached to the target content block of each named boundary. A `system` boundary or a `messages[i]` boundary whose current content is a bare string is first normalized into a single-element content-block array (a plain string can't itself carry `cache_control`) before the property is attached — this is the same string→block-array normalization envelope-builder.md's `TurnEnvelope.request` already expects callers of the Messages API to produce, so the returned params stay compatible with it. Throws a plain `Error` with a clear message (`"markBreakpoints: at most 4 cache boundaries allowed, got <n>"`) when `boundaries.length > 4` — a real 400 from the Messages API otherwise, worth catching before the network call. Does **not** validate the 1024-token minimum pre-call: unlike the 4-breakpoint cap, going under the minimum isn't an API error, it's a silent no-op (the region just isn't cached), so there's nothing to validate against — see `readCacheStatus` below for how a consumer actually learns whether a breakpoint "took."
  - `readCacheStatus(usage: TurnUsage): { read: boolean; write: boolean }` — `read: (usage.cacheReadInputTokens ?? 0) > 0`, `write: (usage.cacheCreationInputTokens ?? 0) > 0`. Takes the already-mapped `TurnUsage` shape from [`envelope-builder.md`](../shared/envelope-builder.md)'s `EnvelopeBuilderService.build()` output (not the raw SDK response), so a consumer composes it directly: `build()` then `readCacheStatus(envelope.usage)` to fill `architecture.md`'s `cache: { read, write }` envelope field. This is also the mechanism that makes the 1024-token-minimum case observable at all — a boundary placed under the minimum simply comes back with `write: false`, indistinguishable at this layer from "no boundary was marked," which is the correct behavior (the helper reports what actually happened, not what was requested).
- **`CachingLayerModule`** (`caching-layer.module.ts`) — `providers: [CachingLayerService], exports: [CachingLayerService]`. No consumer imports it yet; [`feature-workflow-gallery.md`](feature-workflow-gallery.md) and [`feature-document-research-assistant.md`](feature-document-research-assistant.md) are the first two, each importing this module directly and injecting `CachingLayerService`.

## Consumers

- [`feature-workflow-gallery.md`](feature-workflow-gallery.md) — caches the system prompt/tool definitions shared across its routing/chaining/parallelization/evaluator-optimizer calls.
- [`feature-document-research-assistant.md`](feature-document-research-assistant.md) — caches the fetched document so follow-up questions in the same session are fast/cheap.

Foundations Console does **not** use this piece — its own plan file has no caching feature.

## Potential other uses

Any future feature that repeats a system prompt, tool set, or long content block across multiple calls in a session can opt in the same way Document Research Assistant and Workflow Gallery do — the helper isn't tied to either feature's specific content, only to "where in the block order does this cache boundary sit."

## Guiding principles

- [`guiding-principles.md`](../technical/guiding-principles.md), "One inspector, many labs" — the read/write status this module reports is exactly what the shared inspector panel displays; this module exists so every consumer reports it the same way rather than each computing it ad hoc.

## Depends on

None — this is a standalone shared module with no dependency on prior work.

## Build order & dependencies

Right after Live Tool-Use Console, before Workflow Gallery (see `status.md` for current position). Workflow Gallery is built before Document Research Assistant in the overall sequence and already depends on this piece, so it must exist before Workflow Gallery, not deferred until Document Research Assistant as an earlier draft of the plan implied.

## Test scenarios

### Automated

Per [`testing-strategy.md`](../technical/testing-strategy.md)'s "Backend unit" bucket — this module has no external client of its own (it only reshapes a params object and reads already-computed usage numbers), so unit tests alone (no `nock`, no integration bucket) fully cover it:

- [ ] `markBreakpoints` attaches `cache_control: { type: 'ephemeral' }` to the last element of `tools` for a `{ region: 'tools' }` boundary.
- [ ] `markBreakpoints` attaches it to the system block for a `{ region: 'system' }` boundary, first converting a bare string `system` into a one-element content-block array.
- [ ] `markBreakpoints` attaches it to the last content block of `messages[messageIndex]` for a `{ region: 'messages', messageIndex }` boundary, first converting a bare string message `content` into a one-element content-block array.
- [ ] Multiple boundaries (2–4, mixing `tools`/`system`/`messages`) are all applied independently in one `markBreakpoints` call, and the input `params` object is left unmutated.
- [ ] `markBreakpoints` throws a clear error (naming the count given) when passed more than 4 boundaries.
- [ ] `readCacheStatus` returns `{ read: false, write: true }` when only `cacheCreationInputTokens` is present, `{ read: true, write: false }` when only `cacheReadInputTokens` is present, and `{ read: false, write: false }` when neither is present (covers the under-1024-token case, indistinguishable from "no breakpoint marked" at this layer, and a first-ever call with no prior cache to read).

### Manual

None — a real cache hit/write/invalidation against the live Anthropic API can only be observed once a consuming feature actually makes a real call, which is [`feature-workflow-gallery.md`](feature-workflow-gallery.md) and [`feature-document-research-assistant.md`](feature-document-research-assistant.md)'s own manual test scenarios, not this standalone module's — there's no UI here to click through.

## To-do list

- [ ] Implement `CacheBoundary` and the string→content-block-array normalization helper it shares between the `system` and `messages` cases.
- [ ] Implement `markBreakpoints`, including the >4-boundary error.
- [ ] Implement `readCacheStatus`.
- [ ] Wire up `CachingLayerModule`.

## Open questions

None.
