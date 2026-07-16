# Task — Response Envelope Builder

**Status:** 📝 Draft.

## Description

A small shared backend helper that turns a Messages API call's `params`/`response` pair into this app's standard inspector envelope — `{ request, response, usage, stopReason }`, with `usage`'s fields mapped from the SDK's snake_case to this app's camelCase, per `architecture.md`'s "Request/response contract" section. Every lab's backend endpoint has to produce exactly this shape; today the only implementation of it (`buildEnvelope()` in `foundations-console.service.ts`) lives inside that one lab's own service, which was correct while only one lab existed (`repo-layout.md`'s "Lab-specific, or shared functionality?" rule).

Splitting Foundations Console into Messages Console and Structured Output Console (see `task-retire-foundations-console.md`) means two lab areas now need this exact same mapping at once — the textbook trigger `repo-layout.md` names for promotion: "the moment a second lab needs the same thing, it's promoted into a shared module... instead of being copied." This task does that promotion, moving the existing logic (unchanged) into its own shared module rather than duplicating it into both new lab services.

Deliberately narrow: only the `{ request, response, usage, stopReason }` skeleton every lab always produces. The optional `calls` (multi-call turns) and `cache` (cache read/write status) fields `architecture.md` also defines stay assembled by whichever lab actually has a tool loop or places a cache breakpoint — Messages Console and Structured Output Console don't use either, so this task has no opinion on them yet. Model-tier resolution (`ModelConfigService.getModel(choice)`) is already a one-line delegation to an existing shared module and doesn't need its own wrapper here.

## Open questions

- Exact module/service name and file layout under `backend/src/shared/envelope-builder/` — routine, left to the planning pass.
- Whether streaming's own envelope reconstruction (`accumulateStreamedContent` / `buildEnvelopeFromEvents` in the current `foundations-console.service.ts`) belongs in this shared module too, or stays local to Messages Console since it's the only consumer that streams. Leaning toward keeping it lab-local until a second streaming consumer exists — same "wait for a second consumer" rule this task itself was just promoted under — but worth confirming during planning.

## Dependencies

- [`anthropic-client.md`](../shared/anthropic-client.md) — `AnthropicMessage` / `AnthropicMessageParams` types this helper's input/output are built against.
- [`architecture.md`](../technical/architecture.md), "Request/response contract (the inspector's data shape)" — the exact envelope shape this task implements.
