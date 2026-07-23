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

## How to build your own agent from this

1. Pick a small set of **general-purpose, combinable tools** rather than one
   tool per anticipated task — this lab offers `list_files`/`read_file`/`search`
   (generic filesystem primitives) instead of, say, a bespoke
   `find_the_readme` tool. The same principle as Claude Code's own
   bash/read/edit/search toolset: a fixed, small surface that composes to
   cover cases you didn't anticipate, rather than a tool list that grows with
   every new use case.
2. State the **goal**, not the steps, in the system prompt — and say so
   explicitly ("there is no fixed procedure, decide your own steps"), or
   Claude will default to the narrowest plausible interpretation.
3. Write the **loop control flow with zero knowledge of what the tools do** —
   it should only ever branch on `stop_reason`, never on a specific tool
   name. If your loop has a `switch` on tool name anywhere outside the
   tool-execution function itself, you've smuggled a workflow's fixed
   sequencing back into what's supposed to be an agent.
4. **Always cap iterations.** An open-ended loop needs a hard stop
   regardless of goal or toolset — this lab caps at 10 backend-executed tool
   calls (`ITERATION_CAP`) and reports `hitIterationCap: true` rather than
   hanging or erroring when hit. Treat this the same as Workflow Gallery's
   own evaluator-optimizer retry cap: non-negotiable for any loop Claude
   controls the length of.
5. **Nudge self-checking into the prompt**, since nothing else will —
   Claude can't tell a lookup actually answered its question unless it's
   told to verify. This lab's system prompt explicitly asks for that
   ("re-check a prior result... rather than guessing"); the tool-activity
   list below flags a repeated tool+input pair as an "environment
   inspection" instance when it happens.

## Mixing a custom-tool loop with a server-executed tool

`list_files`/`read_file`/`search` are custom tools — your backend executes
them and sends a new call with the result. `ask_deepwiki` (the same MCP
connector [Web & Repo Research Reporter](/web-repo-research-reporter) uses)
is server-executed — it resolves entirely on Anthropic's side, inside
whichever single call it appears in, and comes back as an ordinary
`mcp_tool_use`/`mcp_tool_result` pair. The loop above only advances on the
three custom tools; an MCP call never triggers another round trip by
itself — the `if (response.stop_reason !== 'tool_use')` check in step 3
above is what makes this work for free, since an MCP-only response's
`stop_reason` is never `'tool_use'`.

A `read_file` call for a path that doesn't exist comes back as a
`tool_result` with `"is_error": true`, not a transport failure — Claude sees
the miss and can try a different path instead of the run erroring out.

## Gotcha

An agent's call count is genuinely unpredictable — the same goal can take 2
calls or 9 depending on what Claude decides it needs to check, which is the
entire point of handing over control. That's also exactly why the iteration
cap in step 4 matters far more here than in a workflow, where the call count
is already known in advance from the code alone.
