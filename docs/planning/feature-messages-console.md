# Feature — Messages Console

**Status:** 📝 Draft.

## Description

A raw Claude Messages API explorer: model picker, system-prompt textarea, temperature slider, streaming toggle, and a chat-style running transcript — carved out unchanged from Foundations Console's "Transcript" section (see `task-retire-foundations-console.md`, which retires that bundled page once this feature and `feature-structured-output-console.md` both exist). Demonstrates a plain multi-turn Messages API call, both streamed (Server-Sent Events, per `architecture.md`'s "Streaming transport") and non-streamed, including a system prompt and temperature control.

Backend: one lab area (`backend/src/messages-console/`) exposing a single route (e.g. `POST /api/messages-console/turn`, exact path decided during planning) accepting `{ modelChoice, systemPrompt?, temperature?, messages, stream }` and returning this app's standard envelope, built via [`task-envelope-builder.md`](task-envelope-builder.md) rather than reimplementing the usage/stopReason mapping locally. Frontend: `frontend/src/app/messages-console/`, following `app-shell.md`'s docs → demo → inspector stacking convention, using the shared model picker from [`task-model-picker.md`](task-model-picker.md) instead of its own inline copy.

This is a fresh feature (its own slug, not a follow-on) — Foundations Console's own permanent doc is a different feature identity, being retired rather than renamed; see `task-retire-foundations-console.md`.

## Open questions

- Nav position: already agreed as `first` (replacing Foundations Console's current slot; Structured Output Console goes right after it) — formalize as a `**Nav position:**` line during planning, per `plan-work-item`'s "Feature nav position" step.
- Whether streaming's event-reconstruction logic (`accumulateStreamedContent`/`buildEnvelopeFromEvents` in the current `foundations-console.service.ts`) is this feature's own lab-local code or belongs in `task-envelope-builder.md` — `task-envelope-builder.md`'s own open questions lean toward lab-local for now; confirm during this feature's planning pass.
- Exact route path and DTO field names — routine, left to the planning pass.

## Dependencies

- [`task-envelope-builder.md`](task-envelope-builder.md) — the shared envelope-building helper this feature's backend calls instead of reimplementing usage/stopReason mapping.
- [`task-model-picker.md`](task-model-picker.md) — the shared model-picker component this feature's frontend uses instead of its own inline copy.
- [`model-config.md`](../shared/model-config.md) — `ModelConfigService.getModel(tier)`, resolving `modelChoice` to a real model ID.
- [`anthropic-client.md`](../shared/anthropic-client.md) — `AnthropicClient.createMessage()` / `streamMessage()`, the calls this feature's turn and streaming paths make.
- [`inspector-panel.md`](../shared/inspector-panel.md) — the shared inspector this feature's page renders, including its streaming-event display.
- [`docs-panel.md`](../shared/docs-panel.md) — this feature's in-app doc panel (new doc content authored via `write-lab-doc` once built).
- [`api-error-handling.md`](../shared/api-error-handling.md) — the streaming path's own `shapeError()` call for a terminal `event: error` frame, same pattern the current Foundations Console streaming route already uses.
- [`app-shell.md`](../shared/app-shell.md) — `FEATURE_ROUTES` registration and the docs → demo → inspector page-composition convention.
