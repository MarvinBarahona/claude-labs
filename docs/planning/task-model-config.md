# Task — Config/Model Layer

**Status:** Draft.

**Depends on:** [`task-env-config.md`](task-env-config.md) (reads `ANTHROPIC_API_KEY` through it, not directly).

## Purpose

The central place to pick a model tier per call: default Sonnet, drop to Haiku for classification-heavy steps (Workflow Gallery's routing), reserve Opus for the hardest single calls, and hold the adaptive-thinking effort-level choice (Extended Thinking Bench). Every backend module that calls the Claude API goes through this instead of hardcoding a model string.

## Interface

A backend service exposing something like "give me the model (and, where relevant, an effort level for adaptive thinking) for this call type," so the mapping from call type → model tier lives in one place and can change without touching every module that calls Claude. This project targets only current-generation models (Sonnet, Opus, Haiku, Fable) — none of them accept the older manual `budget_tokens` thinking configuration, so this service only ever hands back an `output_config.effort` value, never a token budget.

Call-type taxonomy and its current model mapping:

- **default** → `claude-sonnet-5` — the balanced tier every feature falls back to unless it asks for something else.
- **classification** → `claude-haiku-4-5` — fastest/cheapest tier, for routing/extraction-style calls (Workflow Gallery's router).
- **hardest-call** → `claude-opus-4-8` — deepest tier, for the single hardest call in a pipeline.
- **thinking-effort** → the `output_config.effort` level (`low` / `medium` / `high` / `xhigh` / `max`) Extended Thinking Bench passes alongside `thinking: {type: "adaptive"}`; the exact levels it sweeps are that feature's own decision to pin down.

Fable is not part of this mapping — it's a distinct, pricier tier a feature can opt into explicitly (as Foundations Console's model picker does), never a default any tier falls back to.

## Consumers

- [`feature-foundations-console.md`](feature-foundations-console.md) — first consumer; picks a model per request from the UI's model picker.
- [`feature-workflow-gallery.md`](feature-workflow-gallery.md) — routing step drops to Haiku for classification.
- [`feature-extended-thinking-bench.md`](feature-extended-thinking-bench.md) — adaptive-thinking effort-level selection.
- Every other feature, at minimum for "which default model to use."

## Potential other uses

Since it already knows the cost/speed tradeoff per tier, it's a natural place to also expose a per-call cost estimate (tokens × published price per tier) for the inspector panel to surface, if that's ever wanted — not committed now, just a natural extension of the same lookup table.

## Build order & dependencies

Order relative to [`task-inspector-panel.md`](task-inspector-panel.md) / [`task-docs-panel.md`](task-docs-panel.md) / [`task-app-shell.md`](task-app-shell.md) doesn't matter — all four sit between `task-env-config.md` and the first feature, Foundations Console (see `status.md` for current position). Depends only on `task-env-config.md` existing.

## Test scenarios

- [ ] Requesting the default tier returns Sonnet.
- [ ] Requesting the classification tier (as Workflow Gallery's router will) returns Haiku.
- [ ] Requesting the hardest-call tier returns Opus.
- [ ] Requesting the thinking-effort tier returns an `output_config.effort` value Extended Thinking Bench can pass straight alongside `thinking: {type: "adaptive"}`.
- [ ] Changing the tier→model mapping in one place is reflected everywhere it's consumed, without per-module edits.

## To-do list

- [ ] Implement the lookup service mapping tier → model identifier, per the taxonomy above.
- [ ] Wire it to read from `task-env-config.md`'s config service wherever a value should be environment-overridable.
- [ ] Document the mapping so later features know which tier to ask for.

## Open questions

None.
