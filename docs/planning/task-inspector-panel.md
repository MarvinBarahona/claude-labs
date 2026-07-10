# Task — Inspector Panel

**Status:** Planned.

## Purpose

The shared "raw payload" panel visible in every feature (per `guiding-principles.md`, "One inspector, many labs"): request JSON, response JSON, streaming event log, `stop_reason`, token `usage`, and cache read/write status per call — so the underlying API mechanics are never hidden behind a feature's demo UI.

## Interface

A frontend component that, given a call's captured request/response data (including streaming events as they arrive), renders all of the fields above. Backend-agnostic: any feature's backend module just needs to shape its response payload consistently enough for this component to consume — no per-feature inspector variants.

## Consumers

Every feature, from Foundations Console onward. [`feature-live-tool-use-console.md`](feature-live-tool-use-console.md) additionally exercises it against streaming tool-argument events and `tool_use`/`tool_result` blocks.

## Potential other uses

Because it's already capturing one call's full request/response, it's a natural place to add a "replay this call" action later (re-send the exact captured request) or a running per-session call history (useful once multi-turn features like Document Research Assistant make more than one call worth comparing) — neither committed now, just noted since the component's data shape already supports it.

## Build order & dependencies

Order relative to [`task-model-config.md`](task-model-config.md) / [`task-docs-panel.md`](task-docs-panel.md) / [`task-app-shell.md`](task-app-shell.md) doesn't matter — all four sit between [`task-env-config.md`](task-env-config.md) and the first feature, Foundations Console (see `status.md` for current position). No dependency on other tasks; testable against fixture request/response JSON before any feature exists to feed it real data.

## Test scenarios

- [ ] Given a fixture non-streaming request/response pair, all fields (request JSON, response JSON, `stop_reason`, `usage`) render correctly.
- [ ] Given a fixture streaming event sequence, the event log renders incrementally in order.
- [ ] Given a fixture response with a cache read and a cache write, both are shown distinctly.
- [ ] Given a fixture `tool_use`/`tool_result` exchange, both block types render legibly (this scenario can only be fully confirmed once Live Tool-Use Console exists, but the component's rendering of arbitrary content blocks should already cover it).

## To-do list

- [ ] Design the component's input data shape (request JSON, response JSON, streaming events, `stop_reason`, `usage`, cache status).
- [ ] Build the static (non-streaming) rendering first, against fixture data.
- [ ] Add incremental streaming-event rendering.
- [ ] Add cache read/write status display.
- [ ] Confirm it renders arbitrary content block types (text, tool_use, tool_result, etc.) without per-block-type special-casing where avoidable.

## Open questions

None.
