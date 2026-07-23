# DeepWiki MCP Connector

The shared DeepWiki MCP integration (`mcp.deepwiki.com`, no auth required) — a public remote MCP server that answers questions about a public GitHub repo's codebase.

## Interface

`backend/src/shared/deepwiki-connector/`:

- **`deepwiki-connector.types.ts`** — `McpRequestFragment = { mcpServers: [{ type: 'url'; url: string; name: string }]; tools: [{ type: 'mcp_toolset'; mcp_server_name: string; allowed_tools?: string[] }]; betas: ['mcp-client-2025-11-20'] }`.
- **`DeepwikiConnectorService.buildRequestFragment(options?: { allowedTools?: string[] }): McpRequestFragment`** — returns the fixed DeepWiki `mcp_servers` entry (`url: 'https://mcp.deepwiki.com/mcp'`, `name: 'deepwiki'`, no `authorization_token` — DeepWiki requires no auth) plus one `mcp_toolset` tools entry pointed at it, with `allowed_tools` set only when `options.allowedTools` is given (omitted entirely otherwise, meaning every tool DeepWiki exposes is enabled). The `mcp-client-2025-11-20` beta is always included. Which repo DeepWiki answers about isn't part of this fragment at all — that's carried entirely in the consuming feature's own system prompt (naming `GITHUB_TARGET_REPO`) and in the arguments Claude itself chooses when it calls one of DeepWiki's tools, not in any connector-level config.
- **`DeepwikiConnectorModule`** (`deepwiki-connector.module.ts`) — `providers: [DeepwikiConnectorService], exports: [DeepwikiConnectorService]`. No DI dependency on `AnthropicClient` or any other client — this service builds a plain config fragment, it never itself calls DeepWiki or the Claude API.

DeepWiki's server exposes exactly three tools — `read_wiki_structure` (list a repo's documentation topics), `read_wiki_contents` (view its generated documentation), and `ask_question` (a free-form, context-grounded Q&A call) — any of which a consumer can name in `options.allowedTools` to narrow the toolset; omitting the option leaves all three enabled. `https://mcp.deepwiki.com/mcp` (used here) and `https://mcp.deepwiki.com/sse` are both valid no-auth endpoints for the same server; this connector uses the `mcp` one, matching the `url`-type MCP server shape above.

## Using it

A consuming feature merges `buildRequestFragment()`'s `mcpServers`/`tools`/`betas` into its own Messages API request (alongside whatever other tools it offers), and names the target repo (`GITHUB_TARGET_REPO`) in its own system prompt — not through this connector. MCP tool calls resolve inside a single Messages API call, same as any other server-executed tool: they come back as ordinary `mcp_tool_use`/`mcp_tool_result` content blocks in the normal response, forwarded through the response envelope unchanged. A DeepWiki-side failure comes back the same way, as a normal `mcp_tool_result`, not a transport failure the consumer needs to catch.

The fragment's `mcpServers` field is camelCase (matching this connector's own type), but the actual Messages API request field is `mcp_servers` (snake_case, like every other request field) — a consumer has to rename it on the way in, e.g. `mcp_servers: fragment.mcpServers`, rather than spreading the fragment's fields as-is into the request object.

No fake/test double of its own — this service builds a plain config object with no external call to substitute. A consuming feature's own fake-mode fallback (in `FakeAnthropicClient`) is what needs to fabricate plausible `mcp_tool_use`/`mcp_tool_result` blocks for a live, unqueued run.

## Testing

`deepwiki-connector.service.spec.ts` covers `buildRequestFragment()` with no options (fixed `mcp_servers` entry, no `allowed_tools` key, the beta present) and with `allowedTools` given (included as `allowed_tools`, everything else unchanged).
