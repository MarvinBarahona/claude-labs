# Feature — Foundations Console

**Status:** Draft.

**Nav position:** first.

## Claude API features

- **Models** — pick a tier by cost/speed/depth: Opus (deepest, slowest, priciest — hard problems), Sonnet (balanced default), Haiku (fastest/cheapest — classification, extraction), Fable (most capable, priciest tier — an explicit opt-in the picker exposes, never the default).
- **Request/response lifecycle** — every request needs an API key, `model`, `messages` (alternating `user`/`assistant` turns), `max_tokens`; the response returns `content` (blocks), `usage` (token counts), and `stop_reason` (max tokens reached / natural end / stop sequence hit).
- **Multi-turn conversation state** — the Messages API is stateless; the app must keep and resend the full message history on every turn.
- **System prompts** — a separate `system` string sets persona/instructions and applies to every turn without counting as a turn itself.
- **Temperature** — a 0–1 dial on next-token sampling: low (0–0.3) for deterministic/factual output, high (0.8–1.0) for creative/varied output.
- **Streaming** — the response arrives as incremental events (`message_start`, `content_block_delta`, ..., `message_stop`) instead of one blocking call.
- **Structured (JSON-schema) output** — use `output_config: {format: {type: "json_schema", schema}}` (`client.messages.parse` validates automatically); the older prefill-plus-stop-sequence trick is broken on current models (Fable 5, Opus 4.6+, Sonnet 4.6+ reject a trailing assistant message with a 400 error).

## Main idea

A raw API explorer — model picker, system-prompt editor, temperature slider, streaming toggle, running transcript, `stop_reason`/`usage` readout, and a structured-output demo (schema-constrained JSON response). This is the feature that *is* the raw mechanics; every later feature builds on what it establishes.

## Dataset

None — user-driven input only. No external data source, no feature-specific env vars beyond the global `ANTHROPIC_API_KEY`.

## Build order & dependencies

Built right after five foundational tasks already exist (see `status.md` for current position): [`env-config.md`](../shared/env-config.md), [`task-model-config.md`](task-model-config.md), [`task-inspector-panel.md`](task-inspector-panel.md), [`task-docs-panel.md`](task-docs-panel.md), and [`task-app-shell.md`](task-app-shell.md). This feature is the first place all four of the latter are exercised together end-to-end, against a real Claude API call:

- **Inspector panel** — already built against fixture data; this feature is its first real-data consumer.
- **Docs panel** — already built against a fixture doc; this feature is its first real-feature consumer.
- **Config/model layer** — already built; this feature's model picker is its first real consumer.
- **App shell** — already built against a mock route; this feature is its first real-route consumer, and the first entry in the live nav.

No other feature can be built before this one, since the inspector, docs-rendering, and navigation shell (now already in place) are reused by every subsequent feature.

## Files API / base64

Not applicable — no documents or images in this feature.

## Open questions

None.
