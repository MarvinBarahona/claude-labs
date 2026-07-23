# Web & Repo Research Reporter

Ask a research question about the subject repo or its ecosystem; Claude combines a live web search with a direct call to the public DeepWiki MCP server (which already knows the repo's codebase) and returns a structured, cited brief. This is the app's one MCP connector integration — both the web search tool and the MCP connector are server-executed, resolving inside a single Messages API call, so this feature never produces a `calls` array and needs no app-level tool-loop streaming.

## Backend

`backend/src/web-repo-research-reporter/`:

- **`GET /api/web-repo-research-reporter/config`** — `{ targetRepo: string }`, the configured `GITHUB_TARGET_REPO`, so the frontend can name the actual repo in its question placeholder instead of talking about "a repo" in the abstract.
- **`POST /api/web-repo-research-reporter/run`**:
  - Request: `{ question: string; maxSearches?: number }` (`question` non-empty — plain `400` otherwise; `maxSearches` an integer from `1` to `10` when given, defaulting to `5` when omitted — out-of-range or non-integer → plain `400`).
  - Every call's system prompt names the target repo, directs Claude to use the web search tool for current/external information and DeepWiki's tools (`read_wiki_structure`, `read_wiki_contents`, `ask_question`) for questions about the repo's own codebase, and instructs it to politely decline anything unrelated to the repo or its ecosystem rather than answer off-topic.
  - Every call includes the web search tool (`{ type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches }`) and `DeepwikiConnectorService.buildRequestFragment()`'s fragment merged in — its `tools` entry appended to the request's own `tools` array, its `mcpServers` field renamed to the request's `mcp_servers` field (see [`deepwiki-connector.md`](../shared/deepwiki-connector.md)), and its `betas` passed as `AnthropicClient.createMessage()`'s second argument — plus a fixed structured-brief schema via `output_config` (not user-editable, same "fixed demo schema" precedent as Structured Output Console):
    ```ts
    {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: { claim: { type: 'string' }, source: { type: 'string' } },
            required: ['claim', 'source'],
            additionalProperties: false,
          },
        },
      },
      required: ['summary', 'findings'],
      additionalProperties: false,
    }
    ```
  - If the response has no text block to parse against that schema → `ExternalApiError('anthropic', 'Structured response did not include a text block to parse')` → `502`, same pattern as Structured Output Console.
  - Success → `200`:
    ```ts
    TurnEnvelope & {
      brief: { summary: string; findings: { claim: string; source: string }[] };
      searchesPerformed: number;   // count of web_search server_tool_use blocks in the response
      mcpCallsPerformed: number;   // count of mcp_tool_use blocks in the response
    }
    ```
    No `calls` field (always exactly one call) and no `cache` field (no breakpoint placed — a single call has no repeated prefix to cache).

Wired via `WebRepoResearchReporterModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `DeepwikiConnectorModule`) into `AppModule`.

### Fake-mode fallback

`FakeAnthropicClient`'s unqueued-call fallback (`backend/src/testing/anthropic/fake-anthropic-client.ts`) recognizes a request carrying both the web search tool and a `mcp_toolset` entry, and fabricates a `server_tool_use`(`web_search`)/`web_search_tool_result` pair, an `mcp_tool_use`/`mcp_tool_result` pair, and a final text block honoring the request's own `output_config` schema — so the always-fake-mode live demo returns a plausible brief with nonzero counters even with nothing queued, the same precedent as the existing code-execution shape.

## Frontend

`frontend/src/app/web-repo-research-reporter/` (`WebRepoResearchReporter`). Stacks `<app-docs-panel [slug]="'web-repo-research-reporter'" />` → the demo → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. The demo, top to bottom: a free-text research question field (placeholder names the configured target repo once `GET /config` resolves, falling back to a generic placeholder otherwise), a "Max Web Searches" number control (1–10, defaulting to 5, labeled to make clear it caps the web search tool specifically), a Run button, and the rendered brief — summary plus a findings list (each with its claim and a clickable source link) and small "Searches performed"/"DeepWiki calls" counters. No streaming toggle (this route never streams). Per `loading-states.md`, the brief view stays mounted with skeleton placeholders while a run is in flight.

## In-app doc

`frontend/public/lab-docs/web-repo-research-reporter.md` — covers the web search tool and MCP connector mechanics, a real example request/response (including the system prompt's decline instruction), the fixed brief schema, and the gotcha that an MCP-side failure surfaces as an ordinary `mcp_tool_result`, never an HTTP error.

## Testing

- `web-repo-research-reporter.service.spec.ts` (backend unit) — the request includes the web search tool config (`max_uses` from `maxSearches`, defaulting to `5`) and the DeepWiki fragment (`mcp_servers`, `tools`, `mcp-client-2025-11-20` beta); the system prompt names the target repo and includes the decline instruction; `searchesPerformed`/`mcpCallsPerformed` counted from `server_tool_use`/`mcp_tool_use` blocks; `brief` parsed from the final text block; `ExternalApiError` on a response with no text block.
- `web-repo-research-reporter.e2e-spec.ts` (backend integration) — `nock`-intercepted end-to-end: `GET /config`, the full `200` shape (`nock` fixture including `web_search_tool_result`/`mcp_tool_result` blocks), the `400` paths (empty question, out-of-range/non-integer `maxSearches`), and the `502` no-text-block path.
- `fake-anthropic-client.spec.ts` — the unqueued-call fallback's fabricated web-search/DeepWiki round trip and schema-conforming brief when both tools are offered together.
- `web-repo-research-reporter.spec.ts` (frontend unit) — the question placeholder naming the configured target repo (and its generic fallback on a failed config fetch); the question form, Max Web Searches control (defaulting to 5), and Run button; the brief rendering (summary, findings with source links, both counters) from a mocked response; the completed call reflected in the inspector panel; the visible error state on a failed request; the results-view skeleton holding for the minimum duration.
- `web-repo-research-reporter.spec.ts` (Playwright E2E, `e2e/tests/`) — nav reachable, docs panel renders non-empty content, the happy path submits a question at the default `maxSearches` and confirms the brief (summary/findings, both counters) renders with both `web_search_tool_result` and `mcp_tool_result` visible in the inspector panel.
