# Task — Caching Layer

**Status:** 📝 Draft.

## Purpose

A shared helper for placing and tracking prompt-caching breakpoints (system prompts, tool defs, long documents) so no feature hand-rolls its own cache-breakpoint logic. Encodes the mechanics once: processing always runs tools → system → messages, so a breakpoint caches everything before it too; minimum 1024 tokens to cache, up to 4 breakpoints per request, ~1-hour TTL; changing an earlier region invalidates every region after it, forcing a full-price reprocess.

## Interface

A backend helper that, given a set of content blocks and where they sit in the tools → system → messages order, marks the right breakpoint(s) and reports back whether a given call was a cache read or a cache write (for the inspector panel to display).

## Consumers

- [`feature-workflow-gallery.md`](feature-workflow-gallery.md) — caches the system prompt/tool definitions shared across its routing/chaining/parallelization/evaluator-optimizer calls.
- [`feature-document-research-assistant.md`](feature-document-research-assistant.md) — caches the fetched document so follow-up questions in the same session are fast/cheap.

Foundations Console does **not** use this piece — its own plan file has no caching feature.

## Potential other uses

Any future feature that repeats a system prompt, tool set, or long content block across multiple calls in a session can opt in the same way Document Research Assistant and Workflow Gallery do — the helper isn't tied to either feature's specific content, only to "where in the block order does this cache boundary sit."

## Build order & dependencies

Right after Live Tool-Use Console, before Workflow Gallery (see `status.md` for current position). Workflow Gallery is built before Document Research Assistant in the overall sequence and already depends on this piece, so it must exist before Workflow Gallery, not deferred until Document Research Assistant as an earlier draft of the plan implied.

## Test scenarios

- [ ] A request under the 1024-token minimum is not cached, and the helper reports that correctly rather than silently caching nothing.
- [ ] A breakpoint placed after the system prompt/tool defs correctly caches everything before it (tools → system).
- [ ] A second call with an unchanged prefix reports a cache read (not a cache write) and the inspector panel reflects that.
- [ ] Changing content before an existing breakpoint invalidates it — the next call reports a full cache write, not a partial hit.
- [ ] Up to 4 breakpoints in one request are all tracked and reported individually.

## To-do list

- [ ] Implement the helper for marking cache breakpoints given an ordered set of content blocks.
- [ ] Implement cache read/write reporting for the inspector panel.
- [ ] Validate the 1024-token minimum and 4-breakpoint maximum, surfacing clear errors when violated.
- [ ] Confirm the ~1-hour TTL behavior matches documented expectations in a real call.

## Open questions

None.
