# Feature — Web & Repo Research Reporter

**Status:** Draft.

**Nav position:** after `feature-document-research-assistant`.

## Claude API features

- **Web search tool** — server-executed (Claude runs the search itself, not the app); tool type `web_search_20260209`; key params `max_uses`, `allowed_domains`/`blocked_domains` (mutually exclusive), `user_location`; response has a `server_tool_use` block (the query) plus a `web_search_tool_result` block (`url`, `title`, `page_age`, `encrypted_content`) plus a final `text` block with always-on `citations`; errors come back as a normal 200 with an error object inside the result block, not an HTTP error; billed at $10 per 1,000 searches.
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

- Inspector panel ([`task-inspector-panel.md`](task-inspector-panel.md)), config/model layer ([`model-config.md`](../shared/model-config.md)).
- DeepWiki MCP connector ([`task-deepwiki-connector.md`](task-deepwiki-connector.md)).

## Files API / base64

Not applicable — no documents or images in this feature.

## Open questions

None.
