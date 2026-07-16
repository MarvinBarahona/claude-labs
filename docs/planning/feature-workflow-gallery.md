# Feature — Workflow Gallery: Issue Triage Pipeline

**Status:** 📝 Draft.

**Nav position:** after `feature-vision-lab`.

## Claude API features

The four workflow patterns end to end:

- **Routing** — classify the input into a predefined category first, then send it down the one specialized pipeline built for that category; input only ever goes to one pipeline, not all of them.
- **Chaining** — split the task into sequential, dependent sub-tasks where each step's output feeds the next (e.g. draft → refine), optionally with non-LLM processing (validation, formatting, filtering) in between.
- **Parallelization** — split a decision into independent sub-tasks that don't depend on each other's output (e.g. grading tone, technical accuracy, policy compliance), run them concurrently, then aggregate the results.
- **Evaluator-optimizer** — a producer call generates output and a separate grader call checks it against explicit criteria, returning pass/fail plus feedback; failed attempts loop back to the producer with that feedback until it passes or hits a capped iteration count (always cap it — an unfixable output can otherwise loop forever).

## Main idea

The flagship feature, built on real open issues from the subject GitHub repo: **route** each issue to a category (bug / feature request / question / support), **chain** a draft-then-refine response, **parallelize** grading of the refined draft against several independent criteria, and run the whole thing through an **evaluator-optimizer** loop that keeps feeding grader feedback back into drafting until it passes or hits the iteration cap.

## Dataset & env vars

- **GitHub REST API** — real issues from `GITHUB_TARGET_REPO`, via the GitHub data provider; no new integration. Optionally uses `GITHUB_TOKEN`.

## Build order & dependencies

Right after Live Tool-Use Console proves the GitHub data provider and tool loop, and after the caching layer is built (see `status.md` for current position). This is the highest-value feature, so it's built early rather than last.

- Requires the **GitHub data provider** ([`github-provider.md`](../shared/github-provider.md)).
- Requires the **caching layer** ([`task-caching-layer.md`](task-caching-layer.md), built right before this feature) — the system prompt/tool definitions shared across this feature's routing/chaining/parallelization/evaluator-optimizer calls are cached, so this piece must already exist.
- Requires Live Tool-Use Console's proven tool-use/tool-loop patterns.
- **Feeds forward:** Extended Thinking Bench reuses this feature's real issue data for its thinking on/off comparison; Agent Playground ends with a side-by-side comparison against this feature's fixed-pipeline approach.

## Shared functionality used

- GitHub data provider ([`github-provider.md`](../shared/github-provider.md)).
- Config/model layer ([`model-config.md`](../shared/model-config.md)) — notably, this is where routing drops to Haiku for the classification step.
- Caching layer ([`task-caching-layer.md`](task-caching-layer.md)), shared with Document Research Assistant.

## Files API / base64

Not applicable — no documents or images in this feature.

## Open questions

None.
