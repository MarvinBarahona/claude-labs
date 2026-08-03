# Web & Repo Research Reporter — Billed Search Count

**Status:** 📋 Planned

**Target doc:** [`web-repo-research-reporter.md`](../features/web-repo-research-reporter.md)

## What and why

A `review-guide` audit (2026-08-03, logged in `process-notes.md`) found that this lab's "Searches performed" figure under-reports what actually gets billed.

`WebRepoResearchReporterService.countSearches()` counts response content blocks (`block.type === 'server_tool_use' && block.name === 'web_search'`) and the lab's in-app doc documents the figure that way. But this lab pins `web_search_20260209`, and per the [web search tool docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), that tool version's `allowed_callers` defaults to `["code_execution_20260120"]` — searches run inside code execution (dynamic filtering), and each nested `server_tool_use`/`web_search_tool_result` pair carries a `caller` field identifying the code-execution call, nested inside that call's own result rather than appearing as a top-level block in `response.content` the way the current count assumes. So a turn that ran and was billed for several searches can show a visible-block count that reads low, or zero. On `web_search_20260318` and later, `response_inclusion: "excluded"` can additionally drop those nested pairs from the response entirely — this lab doesn't set that field, but the nesting behavior alone already breaks the count on the pinned `web_search_20260209`.

The authoritative figure is `usage.server_tool_use.web_search_requests`, confirmed against the live docs above (present on every response's top-level `usage`, billed count of actual searches run regardless of whether they were direct or nested under code execution).

## Decisions (resolved from the draft's open questions)

- **Display both figures, labeled distinctly** — the visible-block count (top-level `server_tool_use`/`web_search` blocks actually present in `response.content`) and the billed count (`usage.server_tool_use.web_search_requests`), rather than replacing one with the other. Decided with the user: the discrepancy itself is a teaching moment (dynamic filtering hiding searches from the response body a caller might naively count), consistent with this app's inspector-first "show the real mechanics" ethos (`guiding-principles.md`, "One inspector, many labs"). The in-app lab doc must explain *why* the two numbers can differ, not just display them (see to-do list).
- **`mcpCallsPerformed` has no equivalent risk** — verified against the live [MCP connector docs](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector): `mcp_tool_use`/`mcp_tool_result` are documented as ordinary top-level content blocks with no `caller`/nesting concept and no analogous `usage`-level billed-call counter. `mcpCallsPerformed`'s existing top-level-block count stays as it is — no code change needed there, only confirmed by this planning pass.

## Guiding principles / standing decisions this work item must follow

- `architecture.md`, "Request/response contract" — this task adds two fields (`searchesVisible`, `searchesBilled`) alongside the existing bespoke `mcpCallsPerformed` on this lab's own envelope extension; per `envelope-builder.md` (below), these stay lab-specific fields on `ResearchEnvelope`, not part of the shared `TurnEnvelope`/`TurnUsage` skeleton every lab gets.
- `architecture.md`, "Custom tools vs. server-executed tools" — this task adds one new bullet there (see to-do list) recording the general, project-wide version of the fact above: a server-executed tool's own response content blocks aren't a reliable count of how many times it ran, since nesting under another server tool or an opt-in response-inclusion exclusion can each drop blocks from the top level or the response entirely while the call is still billed; `usage.server_tool_use` carries the authoritative per-tool-type count. Cite this bullet, once written, rather than re-deriving the reasoning if a future lab hits the same shape.
- `testing-strategy.md`, "Five test buckets" — this task's automated scenarios below sit in the existing Backend unit, Backend integration, and Frontend unit buckets already used by this lab (see `web-repo-research-reporter.md`'s own "Testing" section); no new bucket needed.
- `testing-strategy.md`, "Every external client sits behind a mockable seam" — the fake-mode fallback fix below goes through `FakeAnthropicClient` (`backend/src/testing/anthropic/fake-anthropic-client.ts`), the shared test double this project already uses; no lab-local fake logic.

## Dependencies

- [`web-repo-research-reporter.md`](../features/web-repo-research-reporter.md) — the target doc this follow-on updates; read in full during planning. Backend request/response shape, the existing `searchesPerformed`/`mcpCallsPerformed` counters (being renamed/extended by this task), the fake-mode fallback, and existing test coverage all live here — this task updates its "Backend" success-response shape, "Frontend" counter description, "In-app doc" summary, and "Testing" bullets to match the changes below.
- [`envelope-builder.md`](../shared/envelope-builder.md) — confirms `TurnEnvelope`/`TurnUsage` is deliberately narrow (`{ request, response, usage, stopReason }` only); this task's new fields stay on `ResearchEnvelope` itself, not added there.
- [`deepwiki-connector.md`](../shared/deepwiki-connector.md) — confirms MCP tool calls "come back as ordinary `mcp_tool_use`/`mcp_tool_result` content blocks in the normal response, forwarded through the response envelope unchanged," backing the "no equivalent risk" decision above.

## Test scenarios

### Automated

**Backend unit** (`web-repo-research-reporter.service.spec.ts`):
- The existing "counts searchesPerformed/mcpCallsPerformed from server_tool_use/mcp_tool_use blocks" test is renamed/updated: a response with 2 top-level `web_search` `server_tool_use` blocks and `usage.server_tool_use.web_search_requests: 5` yields `searchesVisible: 2` and `searchesBilled: 5` — proving the two counts are computed independently (billed can exceed visible).
- A response whose `usage.server_tool_use` is `null` (the SDK's own default shape, per `message-builders.ts`'s `DEFAULT_USAGE`) yields `searchesBilled: 0`, not `undefined` or a thrown error.
- `mcpCallsPerformed` keeps its existing single test case unchanged (already covered above) — no new scenario needed per the "no equivalent risk" decision.

**Backend integration** (`web-repo-research-reporter.e2e-spec.ts`):
- `fixtureResponse()`'s `nock` fixture is updated to include `usage: { server_tool_use: { web_search_requests: 3 } }` alongside its existing single top-level `web_search`/`web_search_tool_result` pair, so the full `200` response body asserts `searchesVisible: 1` and `searchesBilled: 3` end to end (visible ≠ billed, exercised over the real HTTP pipeline).
- The existing `502` no-text-block scenario is unaffected (doesn't reach the counter logic) and needs no change.

**`fake-anthropic-client.spec.ts`**:
- The existing "fabricates a web-search/DeepWiki-MCP round trip..." test gains an assertion that the fabricated message's `usage.server_tool_use.web_search_requests` is `3`, while the response still carries exactly one top-level `web_search`/`web_search_tool_result` pair — so the always-fake-mode live demo itself demonstrates the visible/billed discrepancy, not just a real-mode response.

**Frontend unit** (`web-repo-research-reporter.spec.ts`):
- A mocked response envelope with `searchesVisible: 1` and `searchesBilled: 3` renders both badges with their own distinct text/testid (see to-do list for exact copy) — replaces the existing single "Searches performed" assertion.
- `mcpCallsPerformed` rendering assertion is unchanged.

**Frontend browser E2E** (`e2e/tests/web-repo-research-reporter.spec.ts`, Playwright):
- The existing happy-path test's `searches-performed` assertion is replaced with two assertions against the renamed testids: the visible-count badge contains `1`, the billed-count badge contains `3` (matching the fake-mode fallback fixed values above). The `mcp-calls-performed` assertion and the inspector-panel block-visibility assertions are unchanged.

### Manual

1. Run the app in fake mode (`docker compose -f docker-compose.dev.yml up`, or use the always-fake live demo), open Web & Repo Research Reporter, submit any research question, and confirm the result shows two distinct search-count badges reading "Searches performed: 1 (visible)" and "Billed: 3" (not a single merged number), alongside the unchanged "DeepWiki calls" badge.
2. Open the lab's in-app doc panel and confirm it now explains, in its own words, why the visible count can read lower than the billed count (dynamic filtering nesting searches under code execution) — not just that the two numbers exist.
3. Open the inspector panel after a run and confirm the raw `usage` JSON shown there still includes `server_tool_use.web_search_requests`, so a reader can cross-check the billed badge against the actual response payload.

## To-do list

- [ ] Backend: in `web-repo-research-reporter.service.ts`, rename the `ResearchEnvelope`/response field `searchesPerformed` to `searchesVisible` (visible top-level `server_tool_use`/`web_search` block count, existing logic unchanged) and add `searchesBilled`, computed as `response.usage.server_tool_use?.web_search_requests ?? 0`. Leave `mcpCallsPerformed` as-is.
- [ ] Backend: update `web-repo-research-reporter.service.spec.ts` per the Automated scenarios above.
- [ ] Backend: update `web-repo-research-reporter.e2e-spec.ts`'s `fixtureResponse()` and its `200` assertions per the Automated scenarios above.
- [ ] Backend: in `fake-anthropic-client.ts`, fix the web-search+MCP fallback branch (`fallbackMessage`) to also override `usage.server_tool_use.web_search_requests` (fixed value `3`) on the fabricated message, alongside its existing content — currently the fallback only overrides `content`, so its `usage.server_tool_use` silently stays the base `null` default and doesn't back the new billed-count display at all.
- [ ] Backend: update `fake-anthropic-client.spec.ts` per the Automated scenario above.
- [ ] Frontend: in `web-repo-research-reporter.ts`, rename/add the matching fields on the local `ResearchEnvelope`/`RunResult` interfaces and `applyEnvelope()`.
- [ ] Frontend: in `web-repo-research-reporter.html`, split the existing single "Searches performed" badge into two badges — `data-testid="searches-visible"` reading "Searches performed: {{ result.searchesVisible }} (visible)" and `data-testid="searches-billed"` reading "Billed: {{ result.searchesBilled }}" — keeping the existing `mcp-calls-performed` badge unchanged.
- [ ] Frontend: update `web-repo-research-reporter.spec.ts` per the Automated scenarios above.
- [ ] E2E: update `e2e/tests/web-repo-research-reporter.spec.ts` per the Automated scenario above.
- [ ] Docs: update `docs/features/web-repo-research-reporter.md` — the `run` success-response shape (`searchesVisible`/`searchesBilled` replacing `searchesPerformed`, with their one-line meanings), the "Frontend" section's counter description, and the "Testing" bullets, to match the changes above.
- [ ] Docs: run the `write-lab-doc` skill against the finished lab code to refresh `frontend/public/lab-docs/web-repo-research-reporter.md` — it must explicitly cover why the visible-block count can undercount the billed count (dynamic filtering nesting searches under code execution, per the docs cited above) and name `usage.server_tool_use.web_search_requests` as the authoritative billed figure, not just present the two badges without explanation.
- [ ] Docs: add a bullet to `architecture.md`'s "Custom tools vs. server-executed tools" section recording the general fact (see "Guiding principles" above): a server-executed tool's own response content blocks aren't a reliable count of how many times it ran — nesting under another server tool, or an opt-in response-inclusion exclusion, can each drop blocks from the top level or the response entirely while the call is still billed; `usage.server_tool_use` carries the authoritative per-tool-type billed count.
- [ ] Run the full required command set from `README.md`'s "Tests" list (backend unit/e2e/lint/build, frontend unit/lint, Playwright E2E) plus the manual scenarios above before treating this task as ready to graduate.
