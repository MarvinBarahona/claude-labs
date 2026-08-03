# Web & Repo Research Reporter — Billed Search Count

**Status:** 📝 Draft

**Target doc:** [`web-repo-research-reporter.md`](../features/web-repo-research-reporter.md)

## What and why

A `review-guide` audit (2026-08-03, logged in `process-notes.md`) found that this lab's "Searches performed" figure under-reports what actually gets billed.

`WebRepoResearchReporterService.countSearches()` counts response content blocks (`block.type === 'server_tool_use' && block.name === 'web_search'`) and the lab's in-app doc documents the figure that way. But this lab pins `web_search_20260209`, and per the [web search tool docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), that tool version's `allowed_callers` defaults to `["code_execution_20260120"]` — searches run inside code execution, and each nested `server_tool_use`/`web_search_tool_result` pair carries a `caller` field rather than appearing as a top-level block the way the current count assumes. On `web_search_20260318` and later, `response_inclusion: "excluded"` can drop those pairs from the response entirely. Either way, a turn that ran and was billed for several searches can show a count that reads low, or zero.

The authoritative figure is `usage.server_tool_use.web_search_requests`, already present on every response's envelope (see `architecture.md`'s `usage` shape).

## Open questions

- Should the displayed number become the billed count (`usage.server_tool_use.web_search_requests`), the current visible-block count, or both labelled distinctly? The audit noted the lab's teaching value may actually be in showing the discrepancy between what's visible in the response and what's billed — worth deciding deliberately rather than just swapping one number for the other.
- Does `mcpCallsPerformed` have an equivalent risk (a billed MCP call not reflected as a top-level `mcp_tool_use` block), or is that counter unaffected? Worth a quick check against the DeepWiki connector's actual response shape before assuming it only affects the web-search side.
- `FakeAnthropicClient`'s fabricated fallback response (`fake-anthropic-client.ts`) currently produces a top-level `server_tool_use`/`web_search_tool_result` pair and a matching `usage.server_tool_use.web_search_requests` — confirm whatever display change is chosen still reads correctly against that fixture, and update the fixture if the chosen shape needs it to also exercise the nested/`caller` case.

## Dependencies

- [`web-repo-research-reporter.md`](../features/web-repo-research-reporter.md) — the target doc this follow-on updates; read in full above. Backend request/response shape, the existing `searchesPerformed`/`mcpCallsPerformed` counters, the fake-mode fallback, and existing test coverage all live here.
