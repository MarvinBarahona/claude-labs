There's no "agent mode" flag in the Messages API. What makes something an
**agent** rather than a **workflow** ([Workflow Gallery](/workflow-gallery),
worth comparing side by side with this lab) is entirely in how *your own
code* is structured around the call — specifically, who decides what the
next call does: your code, or Claude.

## The tell: compare the first call of each lab

Workflow Gallery's routing call:

```json
{
  "model": "claude-haiku-4-5",
  "system": "You are triaging and drafting a response to a GitHub issue...",
  "messages": [{ "role": "user", "content": "Classify this GitHub issue into exactly one category." }],
  "output_config": { "format": { "type": "json_schema", "schema": { "...": "one fixed { category } shape" } } }
}
```

This lab's first (and every) call:

```json
{
  "model": "claude-sonnet-5",
  "system": "You are investigating the GitHub repository <repo>. Your goal is to figure out what this repository does and how it is structured. Decide your own steps using the tools available to you... There is no fixed procedure to follow.",
  "messages": [{ "role": "user", "content": "Begin your investigation." }],
  "tools": [
    { "name": "list_files", "input_schema": { "...": "optional path prefix" } },
    { "name": "read_file", "input_schema": { "...": "required path" } },
    { "name": "search", "input_schema": { "...": "required query" } },
    { "type": "mcp_toolset", "mcp_server_name": "deepwiki" }
  ],
  "mcp_servers": [{ "type": "url", "url": "https://mcp.deepwiki.com/mcp", "name": "deepwiki" }]
}
```

Two differences, and they're the whole story:

- **`tools` + an open-ended goal, instead of `output_config` + a narrow
  question.** Workflow Gallery's routing call can only produce one of 4
  category strings — it's not choosing an action, it's answering a
  classification question. This lab's call can request any of 4 tools, with
  any arguments, or none at all and just answer — Claude is choosing what
  happens next, not just what to say.
- **What your backend code does with the response.** Workflow Gallery's
  `run()` hardcodes the sequence: routing is *always* followed by a draft
  call, then refine, then 3 parallel grading calls, retried up to 3 times —
  regardless of what category came back. This lab's loop (`AgentPlaygroundService.run()`)
  has no idea what "investigating a repo" means; it only knows one rule:

  ```ts
  for (;;) {
    const response = await anthropicClient.createMessage(params, betas);
    if (response.stop_reason !== 'tool_use') { return /* build final envelope */ }
    // execute whichever tool_use block(s) came back, feed the results back, loop
  }
  ```

  That loop is domain-agnostic — it would work unchanged for a completely
  different goal and toolset. The domain knowledge lives entirely in the
  tool definitions and the system prompt, not in the control flow.

The tool list is small and generic for the same reason:
`list_files`/`read_file`/`search` are filesystem primitives, not one bespoke
tool per anticipated question (no `find_the_readme`). It's the shape of
Claude Code's own bash/read/edit/search toolset — a fixed, small surface that
composes to cover cases the tool author never anticipated. A tool list that
grows an entry per use case is fixed sequencing smuggled back in under
another name.

## Mixing a custom-tool loop with a server-executed tool

`list_files`/`read_file`/`search` are custom tools — your backend executes
them and sends a new call with the result. `ask_deepwiki` (the same MCP
connector [Web & Repo Research Reporter](/web-repo-research-reporter) uses)
is server-executed — it resolves entirely on Anthropic's side, inside
whichever single call it appears in, and comes back as an ordinary
`mcp_tool_use`/`mcp_tool_result` pair. The loop above only advances on the
three custom tools; an MCP call never triggers another round trip by
itself — the `stop_reason !== 'tool_use'` check is what makes this work for
free, since an MCP-only response's `stop_reason` is never `'tool_use'`.

A `read_file` call for a path that doesn't exist comes back as a
`tool_result` with `"is_error": true`, not a transport failure — Claude sees
the miss and can try a different path instead of the run erroring out.

## Environment inspection

Nothing makes Claude double-check itself by default — a lookup that came back
empty reads the same to it as one that answered the question. So the system
prompt asks for it outright: *"inspect your own findings: re-read a file or
re-check a prior tool result if doing so would confirm or correct what you
have learned, rather than guessing."* When Claude takes that up, the
tool-activity list below tags the repeat — any call reusing an earlier call's
exact tool and input — as an **environment inspection**, so a verification
pass is visible as something other than a wasted call.

## Gotcha

An agent's call count is genuinely unpredictable — the same goal can take 2
calls or 9 depending on what Claude decides it needs to check, which is the
entire point of handing over control. That's why this loop needs a hard stop
that a workflow doesn't: it cuts off after 10 total tool calls — both the 3
custom tools and `ask_deepwiki` count toward it, since an MCP call still
costs an extra round trip's worth of resent history even though it resolves
inline — and returns `hitIterationCap: true`, shown as a banner above the
run. The final answer still comes back, but it's whatever Claude had
mid-investigation when the cap hit — not a conclusion it decided it was
ready to give.

The cap is checked once per round trip, not per tool call — a response
requesting several tools at once can still push the total slightly past 10
before that.

## Bounding tool-result cost

Nothing about the Messages API stops a tool result from being huge, and a
huge result gets resent as input on every later call in the loop — so it's
on you to bound it. The two tool kinds need different treatment:

A **custom tool's** result is built by your own backend code, so you can
just cap it before returning it — `list_files`/`read_file`/`search` here all
truncate to a fixed size and add a `truncated` field so Claude knows a
result is partial rather than mistaking it for the whole answer.

A **server-executed tool's** result is different: it's generated and billed
as input tokens the moment it resolves, inside the same call that requested
it — before your backend ever sees the response. Capping it after the fact
can't undo that cost; it can only limit what gets resent later. If one of
the tool's own operations has no size limit (DeepWiki's `read_wiki_contents`
returns an entire generated wiki, for instance), the only real fix is to not
let the model call it. For an MCP toolset that means restricting the
`mcp_toolset` entry itself, disabling everything by default and re-enabling
only specific tool names:

```json
{
  "type": "mcp_toolset",
  "mcp_server_name": "deepwiki",
  "default_config": { "enabled": false },
  "configs": {
    "read_wiki_structure": { "enabled": true },
    "ask_question": { "enabled": true }
  }
}
```

`configs` is an object keyed by tool name, not an array — worth
double-checking against the live docs, since it's easy to guess wrong.
