# Task — DeepWiki MCP Connector

**Status:** 📋 Planned.

## Purpose

The shared DeepWiki MCP integration (`mcp.deepwiki.com`, no auth required) — a public remote MCP server that answers questions about a public GitHub repo's codebase. Originally embedded inline in Web & Repo Research Reporter's plan, but reused as-is by Agent Playground — the same "more than one feature will need it" shape `github-provider.md` and `caching-layer.md` already cover, so it's pulled out as its own task rather than left as an implicit reference in one feature's file.

## Interface

`backend/src/shared/deepwiki-connector/`:

- **`deepwiki-connector.types.ts`** — `McpRequestFragment = { mcpServers: [{ type: 'url'; url: string; name: string }]; tools: [{ type: 'mcp_toolset'; mcp_server_name: string; allowed_tools?: string[] }]; betas: ['mcp-client-2025-11-20'] }`.
- **`DeepwikiConnectorService.buildRequestFragment(options?: { allowedTools?: string[] }): McpRequestFragment`** — returns the fixed DeepWiki `mcp_servers` entry (`url: 'https://mcp.deepwiki.com/mcp'`, no `authorization_token` — DeepWiki requires no auth) plus one `mcp_toolset` tools entry pointed at it, with `allowed_tools` set only when `options.allowedTools` is given (omitted entirely otherwise, meaning every tool DeepWiki exposes is enabled). The `mcp-client-2025-11-20` beta is always included. Which repo DeepWiki answers about isn't part of this fragment at all — that's carried entirely in the consuming feature's own system prompt (naming `GITHUB_TARGET_REPO`) and in the arguments Claude itself chooses when it calls one of DeepWiki's tools, not in any connector-level config.
- **`DeepwikiConnectorModule`** (`deepwiki-connector.module.ts`) — `providers: [DeepwikiConnectorService], exports: [DeepwikiConnectorService]`. No DI dependency on `AnthropicClient` or any other client — this service builds a plain config fragment, it never itself calls DeepWiki or the Claude API.

Confirmed against DeepWiki's own current listing: the server exposes exactly three tools — `read_wiki_structure` (list a repo's documentation topics), `read_wiki_contents` (view its generated documentation), and `ask_question` (a free-form, context-grounded Q&A call) — any of which a consumer can name in `options.allowedTools` to narrow the toolset; omitting the option leaves all three enabled. `https://mcp.deepwiki.com/mcp` (used here) and `https://mcp.deepwiki.com/sse` are both valid no-auth endpoints for the same server; this connector uses the `mcp` one, matching the `url`-type MCP server shape already fixed above.

## Consumers

- [`feature-web-repo-research-reporter.md`](feature-web-repo-research-reporter.md) — first consumer; combines this connector with the web search tool for a cited research brief.
- [`feature-agent-playground.md`](feature-agent-playground.md) — reuses this connector as one of the agent's abstract tools (alongside GitHub REST calls) for open-ended repo exploration.

## Potential other uses

Any later feature that wants codebase-aware Q&A about the subject repo can call this instead of standing up its own MCP client wiring — the interface is already generic to "ask DeepWiki about `GITHUB_TARGET_REPO`," not specific to either current consumer's UI.

## Build order & dependencies

Right before Web & Repo Research Reporter (see `status.md` for current position) — nothing built before it depends on it, and it unlocks both Web & Repo Research Reporter and, later, Agent Playground. Shares `GITHUB_TARGET_REPO` with the GitHub data provider (via [`env-config.md`](../shared/env-config.md)) but doesn't depend on the GitHub data provider itself — DeepWiki is a separate, already-key-free integration, the same relationship Web & Repo Research Reporter's own plan file already describes.

## Guiding principles

- [`guiding-principles.md`](../technical/guiding-principles.md), "Minimize integrations" — this is the app's one deliberate MCP integration, built once and shared across both consumers rather than each standing up its own MCP client wiring.

## Architecture

- [`architecture.md`](../technical/architecture.md), "Custom tools vs. server-executed tools" — MCP connector calls resolve inside a single Messages API call, same as any other server-executed tool: "the backend forwards those blocks through the same envelope unchanged; it does not loop, and does not need to implement the tool's function itself." This is why this task has no error-handling logic of its own — a DeepWiki-side failure comes back as an ordinary `mcp_tool_result` in the normal response, forwarded like any other content block, not a transport failure this service needs to catch.

## Test scenarios

### Automated

Per [`testing-strategy.md`](../technical/testing-strategy.md)'s "Backend unit" bucket — this is a pure config-building service with no external client:

- [ ] `buildRequestFragment()` with no options returns the fixed DeepWiki `mcp_servers` entry (no `authorization_token`), an `mcp_toolset` tools entry with no `allowed_tools` key, and the `mcp-client-2025-11-20` beta.
- [ ] `buildRequestFragment({ allowedTools: [...] })` includes that array as `allowed_tools` on the `mcp_toolset` entry, everything else unchanged.

### Manual

None — no UI of its own. A real DeepWiki round trip is verified once a consuming feature is run against a real key — [`feature-web-repo-research-reporter.md`](feature-web-repo-research-reporter.md)'s own manual test scenario, not this task's.

## To-do list

- [ ] Implement `DeepwikiConnectorService.buildRequestFragment()`, including the optional tool allowlist.
- [ ] Wire up `DeepwikiConnectorModule`.

## Open questions

None.
