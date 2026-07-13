# Task — Inspector Panel

**Status:** In progress.

## Purpose

The shared "raw payload" panel visible in every feature (per `guiding-principles.md`, "One inspector, many labs"): request JSON, response JSON, streaming event log, `stop_reason`, token `usage`, and cache read/write status per call — so the underlying API mechanics are never hidden behind a feature's demo UI.

## Interface

A frontend component that, given a call's captured request/response data (including streaming events as they arrive), renders all of the fields above. Backend-agnostic: any feature's backend module just needs to shape its response payload consistently enough for this component to consume — no per-feature inspector variants.

## Consumers

Every feature, from Foundations Console onward. [`feature-live-tool-use-console.md`](feature-live-tool-use-console.md) additionally exercises it against streaming tool-argument events and `tool_use`/`tool_result` blocks.

## Potential other uses

Because it's already capturing one call's full request/response, it's a natural place to add a "replay this call" action later (re-send the exact captured request) or a running per-session call history (useful once multi-turn features like Document Research Assistant make more than one call worth comparing) — neither committed now, just noted since the component's data shape already supports it.

## Build order & dependencies

Order relative to [`model-config.md`](../shared/model-config.md) / [`task-docs-panel.md`](task-docs-panel.md) / [`task-app-shell.md`](task-app-shell.md) doesn't matter — all four sit between [`env-config.md`](../shared/env-config.md) and the first feature, Foundations Console (see `status.md` for current position). No dependency on other tasks; testable against fixture request/response JSON before any feature exists to feed it real data.

## Test scenarios

- [x] Given a fixture non-streaming request/response pair, all fields (request JSON, response JSON, `stop_reason`, `usage`) render correctly.
- [x] Given a fixture streaming event sequence, the event log renders incrementally in order.
- [x] Given a fixture response with a cache read and a cache write, both are shown distinctly.
- [x] Given a fixture `tool_use`/`tool_result` exchange, both block types render legibly (this scenario can only be fully confirmed once Live Tool-Use Console exists, but the component's rendering of arbitrary content blocks should already cover it).

## To-do list

- [x] Design the component's input data shape (request JSON, response JSON, streaming events, `stop_reason`, `usage`, cache status).
- [x] Build the static (non-streaming) rendering first, against fixture data.
- [x] Add incremental streaming-event rendering.
- [x] Add cache read/write status display.
- [x] Confirm it renders arbitrary content block types (text, tool_use, tool_result, etc.) without per-block-type special-casing where avoidable.

## Open questions

None.

## Development notes

- **[technical]** `InspectorCall`/`InspectorUsage` (`frontend/src/app/shared/inspector-panel/inspector-call.ts`) is the contract every lab's backend response payload must be shaped into: `request`/`response` are passed through as opaque `unknown` (rendered as pretty-printed JSON, never field-accessed), while `stopReason` and `usage` are camelCase fields a backend module maps from the Claude API's snake_case response before sending it to the frontend. `streamEvents` is a plain array a caller replaces wholesale (new array reference) as events arrive — `OnPush` picks up the new input each time, no internal buffering in the component itself.
- **[technical]** Content blocks are read from `response.content` (an array) when present, and rendered generically via a single loop keyed on each block's own `type` field — no per-type template branches. This already covers `tool_use`/`tool_result` today; confirmed with fixture data since Live Tool-Use Console doesn't exist yet.
- **[process]** Component lives at `frontend/src/app/shared/inspector-panel/` — a `shared/` folder groups frontend cross-cutting components (inspector panel, and eventually the docs renderer and page layout/nav from `task-docs-panel.md`/`task-app-shell.md`) separately from per-lab areas, so the two categories `repo-layout.md` already distinguishes ("lab areas" vs. "shared functionality") stay visually distinct as more lab folders land in `frontend/src/app/`. `docs-panel` and `app-shell` should follow the same `shared/` placement when built, for consistency.
- **[process]** `backend/.env` didn't exist in this checkout (only `.env.example`), which left `docker compose run --rm frontend ...` failing because the frontend service depends on the backend passing its healthcheck. Copied `.env.example` → `.env` (placeholder values, gitignored) to unblock the test run — no code change, but worth knowing this step is needed on a fresh clone despite `CLAUDE.md` saying no real credentials are needed (the file itself still has to exist).
- **[non-owned-file suggestion]** `README.md`'s Quick start (`docker compose up --build`) should mention `cp backend/.env.example backend/.env` as a first step, with a one-line note on why it's needed — otherwise a fresh clone's backend container fails its healthcheck and the frontend container (which depends on it) never starts.
