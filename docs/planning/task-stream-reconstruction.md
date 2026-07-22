# Task — Streamed-Response Reconstruction

**Status:** 📝 Draft.

## What this is

Every lab that streams reconstructs a full `Message`-shaped response from raw SSE events by hand — `envelope-builder.md` deliberately keeps this lab-local rather than shared, composing with `EnvelopeBuilderService.build()` as its final step. Three labs now have byte-for-byte the same hand-rolled reconstruction function (`messages-console.service.ts`, `live-tool-use-console.service.ts`, `document-research-assistant.service.ts`), each with its own `if (event.delta.type === '...')` branch per delta kind it knows about.

This has already dropped two different delta kinds silently, found only by hitting each live rather than by design:

- `thinking_delta`/`signature_delta` weren't handled at all originally — a streamed `thinking` block got reconstructed with an empty `thinking` field, harmless until resent as history on a later call, where the real API rejected it (`each thinking block must contain thinking`). Fixed in `document-research-assistant.service.ts`'s own copy; `messages-console.service.ts` and `live-tool-use-console.service.ts` still have the identical gap, unfixed, since fixing another already-shipped feature's code was outside that fix's own scope.
- `citations_delta` wasn't handled either — a streamed ask's text block never accumulated its citations, so a citations-enabled lab's streamed turns always came back with an empty citations list. Fixed in `document-research-assistant.service.ts`, the only lab currently offering a citations-enabled document.

Nothing about this pattern forces every delta kind Claude can emit to be handled — a missing case fails silently (an empty or missing field) rather than at compile time, and the same gap has to be independently rediscovered per copy. This task is to close that gap properly, rather than patching a fourth delta kind into three separate copies again next time.

## Open questions

- Promote the reconstruction into a genuinely shared helper (revisiting `envelope-builder.md`'s "stays lab-local" call, made before this same gap had shown up twice), or keep it lab-local but make each copy exhaustive over the SDK's delta-type union (e.g. a switch with a compile-time `never` check on the default case) so an unhandled kind is a build failure instead of a silent drop? Either resolves the actual bug class; which one also depends on how much the three labs' own accumulation logic has actually diverged since this task was drafted — reread all three's current reconstruction code as part of planning, not just this note.
- Whether fixing the still-open `thinking_delta`/`signature_delta` gap in `messages-console.service.ts` and `live-tool-use-console.service.ts` belongs in this same task or should stay a separate, narrower fix landed first (this task blocking on it, or absorbing it) — decide during planning once the shared-vs-exhaustive-copies question above is settled, since the answer changes what "fixing it in both places" actually means.

## Likely dependencies

- [`envelope-builder.md`](../shared/envelope-builder.md) — the module this task's outcome composes with either way; its "stays lab-local" note is the specific decision this task revisits.
- [`anthropic-client.md`](../shared/anthropic-client.md) — the source of the `AnthropicStreamEvent`/delta-type union each copy currently switches on by hand.
- [`messages-console.md`](../features/messages-console.md) — one of the three existing copies (`messages-console.service.ts`), missing `thinking_delta`/`signature_delta`.
- [`live-tool-use-console.md`](../features/live-tool-use-console.md) — the second existing copy (`live-tool-use-console.service.ts`), same gap.
- [`document-research-assistant.md`](../features/document-research-assistant.md) — the third copy (`document-research-assistant.service.ts`), where both gaps were found and fixed locally first; its own reconstruction is the most complete of the three right now (handles `text_delta`/`thinking_delta`/`signature_delta`/`citations_delta`/`input_json_delta`) and is the natural starting point for whichever resolution this task picks.
