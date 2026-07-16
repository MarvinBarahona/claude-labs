# Feature — Structured Output Console

**Status:** 📝 Draft.

## Description

A structured (JSON-schema) output demo: free-text input, a single blocking Messages API call with `output_config: {format: {type: "json_schema", schema}}` set to a fixed demo schema (`{ summary, sentiment, actionItems }`), and the parsed result rendered — carved out unchanged from Foundations Console's "Structured output demo" section (see `task-retire-foundations-console.md`, which retires that bundled page once this feature and `feature-messages-console.md` both exist). Demonstrates forcing a schema-conformant response, not the SDK's own `client.messages.parse()` convenience wrapper, which would bypass the shared `anthropic-client.md` token — same reasoning the original Foundations Console doc already recorded.

Backend: one lab area (`backend/src/structured-output-console/`) exposing a single route (e.g. `POST /api/structured-output-console/run`, exact path decided during planning) accepting `{ modelChoice, input }` and returning this app's standard envelope plus a sibling `parsed` field, built via [`task-envelope-builder.md`](task-envelope-builder.md) rather than reimplementing the usage/stopReason mapping locally. Frontend: `frontend/src/app/structured-output-console/`, following `app-shell.md`'s docs → demo → inspector stacking convention, using the shared model picker from [`task-model-picker.md`](task-model-picker.md) instead of its own inline copy.

This is a fresh feature (its own slug, not a follow-on) — Foundations Console's own permanent doc is a different feature identity, being retired rather than renamed; see `task-retire-foundations-console.md`.

## Open questions

- Nav position: already agreed as `after messages-console` — formalize as a `**Nav position:**` line during planning, per `plan-work-item`'s "Feature nav position" step.
- Whether the demo schema stays hardcoded exactly as today, or this planning pass wants to reconsider it — not raised by the split itself, flagging only because it's an easy thing to reconsider while this feature's own plan file is being written anyway.
- Exact route path and DTO field names — routine, left to the planning pass.

## Dependencies

- [`task-envelope-builder.md`](task-envelope-builder.md) — the shared envelope-building helper this feature's backend calls instead of reimplementing usage/stopReason mapping.
- [`task-model-picker.md`](task-model-picker.md) — the shared model-picker component this feature's frontend uses instead of its own inline copy.
- [`model-config.md`](../shared/model-config.md) — `ModelConfigService.getModel(tier)`, resolving `modelChoice` to a real model ID.
- [`anthropic-client.md`](../shared/anthropic-client.md) — `AnthropicClient.createMessage()`, the single blocking call this feature makes.
- [`inspector-panel.md`](../shared/inspector-panel.md) — the shared inspector this feature's page renders.
- [`docs-panel.md`](../shared/docs-panel.md) — this feature's in-app doc panel (new doc content authored via `write-lab-doc` once built).
- [`app-shell.md`](../shared/app-shell.md) — `FEATURE_ROUTES` registration and the docs → demo → inspector page-composition convention.
