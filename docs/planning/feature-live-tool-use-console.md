# Feature — Live Tool-Use Console

**Status:** Draft.

**Nav position:** after `feature-foundations-console`.

## Claude API features

- **Custom tool definitions** — described to Claude via a JSON Schema `input_schema`; use descriptive function/parameter names (Claude reads them to decide when/how to call the tool) and return clear validation-error messages so Claude can self-correct and retry.
- **Tool-use/tool-result loop** — Claude signals `stop_reason: "tool_use"` and returns one or more `tool_use` blocks (`id`, `name`, `input`); the app runs the real function(s) and replies with a `tool_result` block per call (matching `tool_use_id`), batching all of them into a single new `user` message; repeat until `stop_reason != "tool_use"`.
- **Fine-grained (eager) tool-argument streaming** — by default, streamed tool-argument JSON is buffered per top-level field then delivered in bursts (each burst is schema-valid); setting `eager_input_streaming: true` on a tool definition delivers chunks as soon as Claude generates them, at the cost of the app having to tolerate incomplete/invalid JSON mid-stream.

## Main idea

Claude answers free-form questions by choosing between two independent custom tools — "get weather for a location" and "get stats/latest activity for the subject GitHub repo." Demonstrates the full request → `tool_use` → `tool_result` → final-answer loop, multi-tool selection, and streaming tool arguments as they're generated.

## Dataset & env vars

Two independent sources:

- **Open-Meteo API** — no auth required. Backs the weather tool: a second, unrelated custom tool (real-time weather by location) that proves Claude can choose between multiple distinct tools, not just one.
- **GitHub REST API** (`api.github.com`) — backs the repo-stats tool, via the shared GitHub data provider (see Dependencies below). Uses `GITHUB_TARGET_REPO` (default `angular/angular`) and, optionally, `GITHUB_TOKEN` to raise the rate limit.

## Build order & dependencies

Right after the GitHub data provider exists (see `status.md` for current position).

- Requires Foundations Console's shell (inspector panel, config/model layer) to already exist.
- Requires the **GitHub data provider** ([`task-github-provider.md`](task-github-provider.md)) to already exist — this feature is the provider's first consumer.
- Introduces the tool-use/tool-loop pattern that Workflow Gallery (built right after this one) and Agent Playground (last) both reuse.

## Shared functionality used

- Inspector panel ([`task-inspector-panel.md`](task-inspector-panel.md)) — streaming tool-argument events, `tool_use`/`tool_result` blocks.
- Config/model layer ([`model-config.md`](../shared/model-config.md)).
- GitHub data provider ([`task-github-provider.md`](task-github-provider.md)) — consumed, not introduced.

## Files API / base64

Not applicable — no documents or images in this feature.

## Open questions

None.
