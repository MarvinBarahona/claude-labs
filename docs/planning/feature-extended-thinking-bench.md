# Feature — Extended Thinking Bench

**Status:** 📝 Draft.

**Nav position:** after `feature-workflow-gallery`.

## Claude API features

- **Adaptive thinking** — `thinking: {type: "adaptive"}` lets Claude decide when and how much to think, returning `thinking` content blocks before the final answer; depth is tuned via `output_config: {effort: "low" | "medium" | "high" | "xhigh" | "max"}`, not a manual token budget — current models (Sonnet, Opus) reject the older `budget_tokens` field with a 400. `thinking.display` must be set to `"summarized"` explicitly to get readable reasoning text back; the default, `"omitted"`, streams `thinking` blocks with empty text. Incompatible with message prefilling and a forced (non-`auto`) `tool_choice`; decide whether to enable it with evals — only worth it once plain prompting plateaus, not a default-on setting.

## Main idea

Re-run a genuinely hard reasoning step from Workflow Gallery's triage pipeline (e.g. a contentious or ambiguous real issue) with thinking off vs. adaptive-on at a couple of effort levels, showing the reasoning trace, latency/cost delta, and answer-quality difference side by side — framed as "only worth turning on once plain prompting plateaus," not a default-on setting.

## Dataset & env vars

- Reuses **Workflow Gallery's real issue data** — no new integration, no new env vars.

## Build order & dependencies

Layers directly onto Workflow Gallery (see `status.md` for current position).

- Requires **Workflow Gallery** to be built first: this feature picks a specific hard issue and pipeline step out of Workflow Gallery's triage flow and re-runs it under different thinking settings.
- Does not call the GitHub data provider directly — it reuses Workflow Gallery's already-fetched issue data.

## Shared functionality used

- Config/model layer ([`model-config.md`](../shared/model-config.md)) — effort-level selection for the thinking-on runs.

## Files API / base64

Not applicable — no documents or images in this feature.

## Open questions

None.
