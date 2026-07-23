# Agent Playground

The one deliberate agent in the app, built to contrast with [Workflow Gallery](workflow-gallery.md)'s fixed pipeline. Given a fixed goal ("figure out what the subject repo does and how it's structured") and a small set of abstract, combinable tools, Claude decides its own steps rather than following a script. The UI surfaces environment-inspection checkpoints — tool calls that re-check a prior result — and ends with a comparison against Workflow Gallery's own numbers for the same kind of subject.

## Backend

`backend/src/agent-playground/`:

- **`POST /api/agent-playground/run`**:
  - Request: `{ stream: boolean }` — no other fields; the goal is fixed, not user-editable, so a run is just a click.
  - Every call offers 4 tools: `list_files` (custom; optional path-prefix filter over `GithubClient.getFileTree()`), `read_file` (custom; backed by `GithubClient.getFileContent()` — see [`github-provider.md`](../shared/github-provider.md)), `search` (custom; case-insensitive substring match over file *paths*, not file contents, from `getFileTree()`), and `ask_deepwiki` (server-executed, via `DeepwikiConnectorService.buildRequestFragment()`). The system prompt states the fixed goal, names the target repo, and nudges environment inspection (re-checking a prior tool result before concluding).
  - The loop advances only on `list_files`/`read_file`/`search` `tool_use` blocks (the custom, backend-executed ones); an `mcp_tool_use` block for `ask_deepwiki` resolves inline within whichever call it appears in and never itself triggers another loop iteration, per [`architecture.md`](../technical/architecture.md)'s "Custom tools vs. server-executed tools".
  - `read_file` on a path that doesn't resolve (or any other `GithubClient.getFileContent()` failure) comes back as `is_error: true`, not a transport failure — see [`architecture.md`](../technical/architecture.md)'s "Error contract" for why this differs from `list_files`/`search`, which let a `GithubClient` failure propagate as a genuine transport error same as any other lab's tools.
  - **Iteration cap: 10** backend-executed tool calls. The loop always fetches one fresh response before checking the cap (so the envelope's top-level `request`/`response` is always a real call pair, per the shared envelope contract), and only declines to *execute* that response's requested tool calls once the cap has already been reached — so a capped run makes **11** total Claude API calls, not 10. Hitting the cap force-stops the loop and returns whatever Claude has produced so far with `hitIterationCap: true`, the same "always cap it" reasoning [`workflow-gallery.md`](workflow-gallery.md) applies to its own evaluator-optimizer loop, generalized here to any open-ended agentic loop.
  - `stream: false` → `200`:
    ```ts
    TurnEnvelope & {
      calls: { request: AnthropicMessageParams; response: AnthropicMessage }[];  // always present — this loop is inherently multi-call by design
      toolActivity: { tool: 'list_files' | 'read_file' | 'search' | 'ask_deepwiki'; input: unknown; result: unknown; isError: boolean }[];  // every tool call across the whole loop (custom and MCP alike), in order
      hitIterationCap: boolean;
      finalAnswer: string;  // Claude's concluding summary of what it learned about the repo
    }
    ```
  - `stream: true` → `200`, `Content-Type: text/event-stream`, same route, same shape as Live Tool-Use Console: raw Claude stream events forwarded verbatim; `event: tool_call_start`/`event: tool_call_result` around each custom-tool execution; a terminal `event: turn_complete\ndata: <same JSON body as the non-streaming success>\n\n`. A mid-stream failure → `event: error\ndata: <ShapedError body JSON>\n\n`, no `turn_complete` after it.

Wired via `AgentPlaygroundModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `StreamResponseBuilderModule` — needed to reconstruct an `AnthropicMessage` from raw stream events for the streaming path, same as `LiveToolUseConsoleModule` — `GithubProviderModule`, `DeepwikiConnectorModule`) into `AppModule`.

## Frontend

`frontend/src/app/agent-playground/` (`AgentPlayground`). Stacks `<app-docs-panel [slug]="'agent-playground'" />` → the demo (Run button — no form fields; streaming toggle; a live tool-activity list showing each of the 4 tools as it's called, with its input/result and an environment-inspection callout on any tool call that re-checks a prior result — same tool name and same JSON-serialized input as an earlier entry; a `hitIterationCap` warning banner when true; the final answer) → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. After a completed run, a comparison callout computed from that run's own numbers ("this agent made `calls.length + 1` calls across `toolActivity.length` tool uses, choosing its own path — compare to Workflow Gallery's fixed pipeline") — static framing copy plus the run's own counts, not a live cross-feature data fetch against Workflow Gallery. Per [`loading-states.md`](../technical/loading-states.md), the tool-activity list and final-answer area stay mounted with skeleton placeholders while a run is in flight, reverting to skeletons again (not blanking) on a second-onward run.

## In-app doc

`frontend/public/lab-docs/agent-playground.md` — covers the mechanical difference between this lab's agentic loop and Workflow Gallery's fixed pipeline (offering `tools` + an open-ended goal vs. `output_config` + a narrow question, and a domain-agnostic loop that only branches on `stop_reason` vs. code that hardcodes the next stage), abstract/combinable tool design, mixing a custom-tool loop with a server-executed MCP tool, the environment-inspection nudge, and the iteration cap — rendered inline by `DocsPanel`.

## Testing

- `agent-playground.service.spec.ts` — unit tests with a fake `AnthropicClient`/`GithubClient` bound via DI: each of the 3 custom tools executing correctly (including `list_files`' path-prefix filter and `search`'s case-insensitive substring match), `read_file`'s not-found path returning `is_error: true`, `ask_deepwiki` offered alongside the 3 custom tools and never advancing the loop by itself, `toolActivity` flattening both tool kinds in order, `calls` in chronological order, and the iteration cap force-stopping at 10 executed tool calls (11 total Claude API calls) with `hitIterationCap: true`.
- `agent-playground.e2e-spec.ts` — integration tests with `nock` intercepting the real Anthropic/GitHub HTTP calls: the full non-streaming and streaming `200` response shapes, and `502`/mid-stream-`error` behavior on a genuine Claude API or GitHub failure.
- `agent-playground.spec.ts` (frontend) — unit tests with `HttpTestingController`: the Run button with no form fields, the tool-activity/final-answer skeletons holding for the minimum duration and reverting to skeletons (not blanking) on a second-onward run, the `hitIterationCap` banner appearing only when true, the comparison callout rendering from a mocked response's own counts, and the visible error state.
- `agent-playground.spec.ts` (Playwright, `e2e/tests/`) — nav reachable as the last entry; docs panel renders non-empty content; the happy path clicks Run (no form fields) and confirms the tool-activity list and a final answer render; the inspector shows the multi-call trace.
