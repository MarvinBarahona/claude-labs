# Feature — Agent Playground

**Status:** 📋 Planned.

**Nav position:** last.

## Claude API features

- **Abstract, combinable tool design** — favor a small set of general-purpose tools (list files, read file, search, ask DeepWiki MCP) over a bespoke tool per anticipated task; Claude composes primitives to cover cases nobody anticipated, and the tool surface doesn't grow unbounded as use cases grow (the same principle behind Claude Code's bash/read/edit/search toolset).
- **Environment inspection** — Claude can't tell whether an action worked unless it's given a way to check; nudge it (via the system prompt) to inspect its own output — re-read a file after "editing" it, check an API response shape, validate generated content — so it can track progress, catch errors, and adapt instead of operating blind.

## Main idea

The one deliberate agent in the app, built specifically to contrast with Workflow Gallery's fixed workflow. Given a goal ("figure out what this repo does and how it's structured") and a small set of abstract tools (list files, read file, search, ask DeepWiki MCP), Claude decides its own steps rather than following a pipeline. The UI surfaces environment-inspection checkpoints (what did Claude check before deciding it was done?) and ends with a short side-by-side comparison against Workflow Gallery: same underlying subject, workflow vs. agent execution.

## Dataset & env vars

- **GitHub REST API** + **DeepWiki MCP** — both already-built integrations, same subject repo (`GITHUB_TARGET_REPO`); no new integration or env vars.

## Build order & dependencies

Last, deliberately, since agents are the exception here, not the default (see `status.md` for current position).

- Requires the **GitHub data provider** ([`github-provider.md`](../shared/github-provider.md)) — extended by this feature, see "Depends on" below.
- Requires the **DeepWiki MCP connector** ([`deepwiki-connector.md`](../shared/deepwiki-connector.md)), reused from Web & Repo Research Reporter.
- Requires **Workflow Gallery** to exist, since this feature closes with a direct comparison against it.

## Shared functionality used

- GitHub data provider ([`github-provider.md`](../shared/github-provider.md)).
- DeepWiki MCP connector ([`deepwiki-connector.md`](../shared/deepwiki-connector.md)).
- Config/model layer ([`model-config.md`](../shared/model-config.md)) — `getModel('default')`.
- Response Envelope Builder ([`envelope-builder.md`](../shared/envelope-builder.md)).

## Files API / base64

Not applicable — no documents or images in this feature.

## Guiding principles

- [`guiding-principles.md`](../technical/guiding-principles.md), "Workflows first, agents last" — this feature *is* the deliberate exception the principle names: framed explicitly as a contrast to Workflow Gallery's fixed pipeline, built last, on purpose.
- [`guiding-principles.md`](../technical/guiding-principles.md), "Minimize integrations" — reuses the GitHub data provider and the DeepWiki connector; no new integration.

## Depends on

- [`architecture.md`](../technical/architecture.md), "Custom tools vs. server-executed tools" — this turn mixes both kinds in one loop: `list_files`/`read_file`/`search` are custom, backend-executed (the loop only advances on their `tool_use` blocks), while `ask_deepwiki` (via [`deepwiki-connector.md`](../shared/deepwiki-connector.md)) is server-executed and resolves inline within whichever call it appears in, per that section's "a single turn can mix both kinds" note.
- [`architecture.md`](../technical/architecture.md), "Streaming transport" — reuses Live Tool-Use Console's exact SSE convention (`tool_call_start`/`tool_call_result` app-level events around each custom-tool execution, terminal `turn_complete`), the same shape this feature's loop already has.
- [`github-provider.md`](../shared/github-provider.md) — extended with a new method, `getFileContent(path: string): Promise<{ content: string; encoding: 'utf-8' | 'base64' }>` (backed by GitHub's Contents API, `GET /repos/{owner}/{repo}/contents/{path}`), since reading a specific file's content is core to this feature and naturally belongs alongside `GithubClient`'s existing list-endpoint methods — unlike a whole new integration, this is one more method on an already-shared client. `RealGithubClient` rethrows any failure as `ExternalApiError('github', ...)` same as its other methods; `FakeGithubClient` gets a matching canned default. This task's own to-do list includes updating `github-provider.md` in place to document the new method once built.

## Endpoint contract

Streaming and non-streaming, reusing Live Tool-Use Console's loop/SSE shape exactly. No request body — the goal is fixed, not user-editable (same "fixed, not user-configurable" precedent as Structured Output Console's schema and Extended Thinking Bench's effort-level set), so a run is just a click.

`backend/src/agent-playground/`:

- **`POST /api/agent-playground/run`**:
  - Request: `{ stream: boolean }` only.
  - Every call offers all 4 tools: `list_files` (custom; `input_schema: { type: 'object', properties: { path: { type: 'string' } } }`, optional path prefix filter over `GithubClient.getFileTree()`), `read_file` (custom; `input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }`, backed by the new `GithubClient.getFileContent()` — a not-found path returns `is_error: true` with a clear message, not a transport failure, same pattern as Live Tool-Use Console's not-found-location case), `search` (custom; `input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }` — a case-insensitive substring match over file *paths* from `getFileTree()`, deliberately not full-text code search, which would need a separate, rate-limited GitHub API this feature doesn't take on), and `ask_deepwiki` (server-executed, via `DeepwikiConnectorService.buildRequestFragment()`). The system prompt states the fixed goal, names the target repo, and nudges environment inspection (re-checking a prior tool result before concluding) per the "Environment inspection" Claude API feature above.
  - The loop advances only on `list_files`/`read_file`/`search` `tool_use` blocks (the custom, backend-executed ones); an `mcp_tool_use` block for `ask_deepwiki` resolves inline within whichever call it appears in and never itself triggers another loop iteration, per the architecture citation above.
  - **Iteration cap: 10** backend-executed tool calls. Hitting it force-stops the loop and returns whatever Claude has produced so far with `hitIterationCap: true` — the same "always cap it" reasoning [`workflow-gallery.md`](../features/workflow-gallery.md) already applies to its evaluator-optimizer loop, generalized here to any open-ended agentic loop.
  - `stream: false` → `200`:
    ```ts
    TurnEnvelope & {
      calls: { request: AnthropicMessageParams; response: AnthropicMessage }[];  // always present — this loop is inherently multi-call by design
      toolActivity: { tool: 'list_files' | 'read_file' | 'search' | 'ask_deepwiki'; input: unknown; result: unknown; isError: boolean }[];  // every tool call across the whole loop (custom and MCP alike), in order — this is what the UI's environment-inspection checkpoints render from
      hitIterationCap: boolean;
      finalAnswer: string;  // Claude's concluding summary of what it learned about the repo
    }
    ```
  - `stream: true` → `200`, `Content-Type: text/event-stream`, same route, same shape as Live Tool-Use Console: raw Claude stream events forwarded verbatim; `event: tool_call_start`/`event: tool_call_result` around each custom-tool execution; a terminal `event: turn_complete\ndata: <same JSON body as the non-streaming success>\n\n`. A mid-stream failure → `event: error\ndata: <ShapedError body JSON>\n\n`, no `turn_complete` after it.

## Frontend

`frontend/src/app/agent-playground/` (`AgentPlayground`). Stacks `<app-docs-panel [slug]="'agent-playground'" />` → the demo (Run button — no form fields, per the fixed goal above; streaming toggle; a live tool-activity list showing each of the 4 tools as it's called, with its input/result and an environment-inspection callout on any tool call that re-checks a prior result; a `hitIterationCap` warning banner when true; the final answer) → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. After a completed run, a small comparison callout computed from that run's own numbers ("this agent made `calls.length` calls across `toolActivity.length` tool uses, choosing its own path — compare to Workflow Gallery's fixed pipeline") — a static piece of framing copy plus the run's own counts, not a live cross-feature data fetch against Workflow Gallery. Per [`loading-states.md`](../technical/loading-states.md), the tool-activity list and answer area stay mounted with skeleton placeholders while a run is in flight.

## Test scenarios

### Automated

Per [`testing-strategy.md`](../technical/testing-strategy.md)'s "Backend unit"/"Backend integration"/"Frontend unit"/"Frontend browser E2E" buckets:

- [ ] **Unit** — `list_files`/`read_file`/`search` execute against a fake `GithubClient`, `read_file` on a not-found path returning `is_error: true` (not a transport failure).
- [ ] **Unit** — `ask_deepwiki` is available via `DeepwikiConnectorService.buildRequestFragment()`, mixed into the same request as the 3 custom tools.
- [ ] **Unit** — the loop advances only on custom-tool `tool_use` blocks; an `mcp_tool_use` block never triggers another loop iteration by itself.
- [ ] **Unit** — the iteration cap (10) is enforced: after 10 backend-executed tool calls, the loop force-stops with `hitIterationCap: true` and no 11th call.
- [ ] **Unit** — `toolActivity` flattens every tool call (custom and MCP alike) across the whole turn, in order.
- [ ] **Unit** — `calls` holds every iteration's call, in true chronological order.
- [ ] **Integration** — a `nock`-intercepted end-to-end run (fixture GitHub + Anthropic responses, including a fixture `mcp_tool_use`/`mcp_tool_result` pair) proves the full non-streaming and streaming shapes.
- [ ] **Frontend unit** — the Run button (no form fields); the live tool-activity list renders each of the 4 tool kinds from mocked SSE frames; the `hitIterationCap` banner appears only when true; the final answer and the Workflow-Gallery comparison callout render from a mocked response using that response's own counts; the tool-activity/answer skeleton holds for the minimum duration per `loading-states.md`.
- [ ] **E2E (Playwright)** — `agent-playground.spec.ts`, per [`frontend-browser-e2e-tests.md`](../shared/frontend-browser-e2e-tests.md)'s "Specs": nav reachable as the last entry; docs panel renders non-empty content; the happy path clicks Run (no form fields) and confirms the tool-activity list and a final answer render.

### Manual

1. With a real `ANTHROPIC_API_KEY` and `GITHUB_TARGET_REPO` configured, run the agent and watch it explore the repo via the streaming tool-activity list — confirm the final answer is a plausible, accurate summary of the repo's structure and purpose.
2. Watch for at least one visible instance of the environment-inspection nudge in practice (e.g. Claude re-reading a file or re-checking a prior tool result before concluding) — a qualitative check, not a hard assertion, since it depends on the model's own judgment call each run.
3. Confirm the Workflow-Gallery comparison callout renders sensibly using that run's own actual call/tool-use counts.

## To-do list

- [ ] Extend `GithubClient`/`RealGithubClient`/`FakeGithubClient` with `getFileContent()`, per "Depends on" above; update `github-provider.md` in place.
- [ ] Implement the `list_files`/`read_file`/`search` tool executors.
- [ ] Wire `DeepwikiConnectorModule`'s `ask_deepwiki` tool into the same request as the 3 custom tools.
- [ ] Implement the tool loop with the 10-iteration cap and `hitIterationCap` flag.
- [ ] Implement `toolActivity` flattening across both tool kinds.
- [ ] Implement streaming, reusing Live Tool-Use Console's SSE plumbing.
- [ ] Build the frontend: Run button, live tool-activity list with environment-inspection callouts, `hitIterationCap` banner, final answer, Workflow-Gallery comparison callout.
- [ ] Write this lab's in-app doc (`write-lab-doc`).
- [ ] Add the browser E2E spec (`e2e/tests/agent-playground.spec.ts`) — per [`frontend-browser-e2e-tests.md`](../shared/frontend-browser-e2e-tests.md)'s "Specs", only once the in-app doc above already exists, since the spec's docs-panel assertion needs real rendered content to check.
- [ ] Wire `AgentPlaygroundModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `GithubProviderModule`, `DeepwikiConnectorModule`).

## Open questions

None.
