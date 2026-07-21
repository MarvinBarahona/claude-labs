# Feature — Web & Repo Research Reporter

**Status:** 📋 Planned.

**Nav position:** after `feature-document-research-assistant`.

## Claude API features

- **Web search tool** — server-executed (Claude runs the search itself, not the app); tool type `web_search_20260209`; key params `max_uses`, `allowed_domains`/`blocked_domains` (mutually exclusive), `user_location`; response has a `server_tool_use` block (the query) plus a `web_search_tool_result` block (`url`, `title`, `page_age`, `encrypted_content`) plus a final `text` block with always-on `citations`; errors come back as a normal 200 with an error object inside the result block, not an HTTP error; billed at $10 per 1,000 searches. `max_uses` is exposed as a UI control here (see "Endpoint contract") rather than a fixed constant, since it's the one search-tool param whose right value genuinely depends on how deep a given research question needs to go, not something a single planning-time default can get right for every question.
- **MCP connector** — calls tools on a remote MCP server directly from the Messages API; requires beta header `mcp-client-2025-11-20`; request needs `mcp_servers` (HTTPS URL + optional OAuth `authorization_token`) and a `tools` entry of `type: "mcp_toolset"` per server (allowlist/denylist which of the server's tools are enabled); response carries `mcp_tool_use`/`mcp_tool_result` blocks; only tool calls are supported (no MCP resources/prompts); not eligible for Zero Data Retention.
- **Structured output** — same `output_config`/JSON-schema mechanism as Foundations Console, used here to shape the final research brief.
- **Citations carried over from search** — the web search tool's citations (above) flow into the structured brief so each claim can point back to its source.

## Main idea

Ask a research question about the subject repo or its ecosystem; Claude combines a live web search with a direct call to the public DeepWiki MCP server (which already knows the repo's codebase) and returns a structured, cited brief. This is the one MCP connector integration in the app.

## Dataset & env vars

- **Web search** — Claude's built-in server-side tool; no separate external key or account needed.
- **DeepWiki MCP** (`mcp.deepwiki.com`) — no auth required; public remote MCP server that answers questions about a public GitHub repo.
- Both are pointed at `GITHUB_TARGET_REPO` (default `angular/angular`).

## Build order & dependencies

First (and only) MCP integration, built once tool-use patterns from Live Tool-Use Console are proven (see `status.md` for current position).

- Requires Live Tool-Use Console's tool-use/tool-loop patterns to already be proven.
- Requires the **DeepWiki MCP connector** ([`task-deepwiki-connector.md`](task-deepwiki-connector.md)) — this feature is its first consumer; Agent Playground (last) reuses it too. Does **not** require the GitHub data provider directly — DeepWiki MCP is a separate, already-key-free integration — but shares the `GITHUB_TARGET_REPO` env var with it (via [`env-config.md`](../shared/env-config.md)).

## Shared functionality used

- Inspector panel ([`inspector-panel.md`](../shared/inspector-panel.md)), config/model layer ([`model-config.md`](../shared/model-config.md)).
- DeepWiki MCP connector ([`task-deepwiki-connector.md`](task-deepwiki-connector.md)).
- Response Envelope Builder ([`envelope-builder.md`](../shared/envelope-builder.md)).

## Files API / base64

Not applicable — no documents or images in this feature.

## Guiding principles

- [`guiding-principles.md`](../technical/guiding-principles.md), "Real data, not fixtures" — a live web search and a live DeepWiki call, never canned research content.
- [`guiding-principles.md`](../technical/guiding-principles.md), "Minimize integrations" — both tools used here (web search, DeepWiki) are either built into the Claude API or already a shared connector; this feature adds no new integration of its own.

## Architecture

- [`architecture.md`](../technical/architecture.md), "Custom tools vs. server-executed tools" — both the web search tool and the MCP connector are server-executed, resolving inside a single Messages API call each; a single turn mixing both (as this feature always does) still resolves in one call, per that section's "a single turn can mix both kinds" note. This is why this feature never produces a `calls` array and needs no app-level tool-loop streaming events.

## Endpoint contract

Non-streaming, single call — the final answer must be schema-conformant JSON (per "Structured output" above), which, per Structured Output Console's own precedent, isn't something worth streaming token-by-token.

`backend/src/web-repo-research-reporter/`:

- **`POST /api/web-repo-research-reporter/run`**:
  - Request: `{ question: string; maxSearches?: number }` (`question` non-empty — plain `400` otherwise; `maxSearches` an integer from `1` to `10` when given, defaulting to `5` when omitted — validated via the request DTO, out-of-range or non-integer → plain `400`).
  - Every call includes the web search tool (`{ type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches }`) and `DeepwikiConnectorService.buildRequestFragment()`'s `mcp_servers`/`tools`/beta fragment merged into the request, plus the fixed structured-brief schema (not user-editable, same "fixed demo schema" precedent as Structured Output Console):
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
    No `calls` field (always exactly one call, per the architecture citation above) and no `cache` field (no breakpoint placed — a single call has no repeated prefix to cache).

## Frontend

`frontend/src/app/web-repo-research-reporter/` (`WebRepoResearchReporter`). Stacks `<app-docs-panel [slug]="'web-repo-research-reporter'" />` → the demo (free-text research question per [`forms.md`](../technical/forms.md), a `maxSearches` control (1–10, defaulting to 5, labeled with the recommended default), Run button, the rendered brief — summary plus a findings list, each with its claim and a clickable source link — and small `searchesPerformed`/`mcpCallsPerformed` counters) → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. No streaming toggle (see "Endpoint contract" above). Per [`loading-states.md`](../technical/loading-states.md), the brief view stays mounted with skeleton placeholders while a run is in flight, since a run combining a live search and an MCP call can take noticeably longer than a plain text call. The in-app lab doc (written via `write-lab-doc` once this lab's code exists) covers what raising or lowering `maxSearches` actually changes — more searches can surface more/better-sourced findings at higher latency and cost ($10/1,000 searches), fewer searches trade thoroughness for a faster, cheaper run — so a visitor changing the control understands the tradeoff, not just the number.

## Test scenarios

### Automated

Per [`testing-strategy.md`](../technical/testing-strategy.md)'s "Backend unit"/"Backend integration"/"Frontend unit"/"Frontend browser E2E" buckets:

- [ ] **Unit** — the request includes the web search tool config with `max_uses` set from `maxSearches` (default `5` when omitted) and `DeepwikiConnectorService.buildRequestFragment()`'s fragment (`mcp_servers`, `tools`, `mcp-client-2025-11-20` beta).
- [ ] **Unit** — a `maxSearches` outside `1`–`10`, or non-integer, is rejected with a plain `400` by the validation pipe.
- [ ] **Unit** — `searchesPerformed`/`mcpCallsPerformed` are correctly counted from a fake response's `server_tool_use`/`mcp_tool_use` blocks.
- [ ] **Unit** — `brief` is parsed from the final text block per the fixed schema.
- [ ] **Unit** — a response with no text block throws `ExternalApiError('anthropic', ...)`.
- [ ] **Integration** — a `nock`-intercepted end-to-end run against a fixture Anthropic response (including fixture `web_search_tool_result`/`mcp_tool_result` blocks) proves the full `200` shape and the `502` no-text-block path.
- [ ] **Frontend unit** — the question form, `maxSearches` control (defaulting to 5), and Run button; the brief renders summary/findings/source links and the two counters from a mocked response; the visible error state on a failed request; the results-view skeleton holds for the minimum duration per `loading-states.md`.
- [ ] **E2E (Playwright)** — `web-repo-research-reporter.spec.ts`, per [`frontend-browser-e2e-tests.md`](../shared/frontend-browser-e2e-tests.md)'s "Specs": nav reachable right after Document Research Assistant; docs panel renders non-empty content; the happy path submits a question at the default `maxSearches`, runs, and confirms the brief (summary, findings, counters) renders.

### Manual

1. With a real `ANTHROPIC_API_KEY`, ask a real research question about the target repo or its ecosystem at the default `maxSearches` — confirm the brief includes at least one claim citing a live web source and at least one claim that reads as DeepWiki-sourced (repo-code-aware), and that `searchesPerformed`/`mcpCallsPerformed` are both nonzero.
2. Confirm the inspector panel's raw response shows both `web_search_tool_result` and `mcp_tool_result` blocks.
3. Re-run the same question at `maxSearches: 1` and then near `10` — confirm `searchesPerformed` never exceeds the requested cap, and that the lab doc's framing of the tradeoff (fewer/cheaper vs. more/thorough) reads true against what actually changes in the brief.

## To-do list

- [ ] Wire the web search tool config (`web_search_20260209`, `max_uses` from the validated `maxSearches` request field, default `5`) into the request.
- [ ] Import `DeepwikiConnectorModule` and merge its request fragment in.
- [ ] Implement the fixed structured-brief schema and `output_config` wiring.
- [ ] Implement `searchesPerformed`/`mcpCallsPerformed` extraction.
- [ ] Implement the no-text-block `502` path.
- [ ] Build the frontend: question form, `maxSearches` control, brief rendering, counters.
- [ ] Write this lab's in-app doc (`write-lab-doc`), explaining what raising/lowering `maxSearches` changes (thoroughness/cost/latency tradeoff), per "Frontend" above.
- [ ] Add the browser E2E spec (`e2e/tests/web-repo-research-reporter.spec.ts`) — per [`frontend-browser-e2e-tests.md`](../shared/frontend-browser-e2e-tests.md)'s "Specs", only once the in-app doc above already exists, since the spec's docs-panel assertion needs real rendered content to check.
- [ ] Wire `WebRepoResearchReporterModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `DeepwikiConnectorModule`).

## Open questions

None.
