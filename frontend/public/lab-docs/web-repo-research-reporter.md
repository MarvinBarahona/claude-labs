Some questions need Claude to go look something up rather than answer from
what it already knows — a live web search, or a direct call to a tool that
knows a specific codebase. This lab asks one research question and lets
Claude combine two server-executed tools in a single call: the built-in
**web search** tool for anything current, and the **MCP connector**, pointed
at the public [DeepWiki](https://mcp.deepwiki.com) server, for questions
about this app's own subject repo. The result comes back as a structured,
cited brief.

## The request

Every run sends both tools, plus a fixed output schema for the final brief:

```json
{
  "model": "claude-sonnet-5",
  "max_tokens": 4096,
  "system": "You are researching the GitHub repository <target repo> and its ecosystem. Use the web search tool for current, external information and the DeepWiki tools (read_wiki_structure, read_wiki_contents, ask_question) for questions about <target repo>'s own codebase and documentation. Answer only the user's research question, citing your sources. If the user asks about anything unrelated to <target repo> or its ecosystem, politely decline and explain that you can only answer research questions about this repository.",
  "messages": [{ "role": "user", "content": "<your research question>" }],
  "tools": [
    { "type": "web_search_20260209", "name": "web_search", "max_uses": 5 },
    { "type": "mcp_toolset", "mcp_server_name": "deepwiki" }
  ],
  "mcp_servers": [
    { "type": "url", "url": "https://mcp.deepwiki.com/mcp", "name": "deepwiki" }
  ],
  "output_config": {
    "format": { "type": "json_schema", "schema": { "...": "see below" } }
  }
}
```

`max_uses` is the **Max Web Searches** control below — it caps how many searches
Claude can run in one call, not how many it must run; a narrow question
might only take one. The MCP connector needs the beta header
`mcp-client-2025-11-20`, sent alongside this request rather than as a param.
Neither tool needs a key or account of your own: web search is Claude's own
built-in tool, and DeepWiki is a public, no-auth MCP server.

## The response

Both tools are server-executed — Claude runs the search and calls DeepWiki
itself, mid-call, and everything comes back in one response, no
back-and-forth your own backend has to drive:

```json
{
  "type": "server_tool_use",
  "name": "web_search",
  "input": { "query": "..." }
}
```

```json
{
  "type": "web_search_tool_result",
  "content": [{ "url": "...", "title": "...", "page_age": "...", "encrypted_content": "..." }]
}
```

```json
{
  "type": "mcp_tool_use",
  "name": "ask_question",
  "server_name": "deepwiki",
  "input": { "question": "..." }
}
```

```json
{ "type": "mcp_tool_result", "tool_use_id": "...", "content": [{ "type": "text", "text": "..." }] }
```

The final `text` block is the brief itself, constrained by `output_config`
to:

```json
{
  "type": "object",
  "properties": {
    "summary": { "type": "string" },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": { "claim": { "type": "string" }, "source": { "type": "string" } },
        "required": ["claim", "source"]
      }
    }
  },
  "required": ["summary", "findings"]
}
```

This lab counts the `server_tool_use` blocks named `web_search` and the
`mcp_tool_use` blocks in the response to show **Searches performed** and
**DeepWiki calls** below — a quick way to see how much lookup work a given
question actually triggered. Open the inspector panel to see every raw
block from a real run, including the ones not rendered in the brief itself.

## Gotcha

An MCP connector call can fail on DeepWiki's side (a malformed query, a
transient error) — but that never surfaces as an HTTP error to your
backend. It comes back as an ordinary `mcp_tool_result` inside the normal
200 response, same as any other content block, which is why this lab's
error handling only has one path: no text block to parse at all, not a
partial or failed tool call.
