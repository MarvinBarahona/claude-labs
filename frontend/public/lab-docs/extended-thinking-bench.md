Extended thinking lets Claude reason step by step in a dedicated `thinking`
content block before it writes its final answer — useful once a task is hard
enough that plain prompting starts to plateau, not something to flip on for
every call. This lab makes that tradeoff visible: it takes one real, genuinely
hard reasoning task (drafting a reply to an actual open issue from this
project's GitHub repo) and re-runs it three times — thinking off, adaptive
thinking at medium effort, and adaptive thinking at high effort — so the
reasoning trace, latency, and answer quality can be compared side by side.

## Adaptive thinking

The current generation of models (Sonnet, Opus, Haiku, Fable) uses **adaptive
thinking**: Claude itself decides whether and how much to think, tuned by an
`effort` level rather than a manually chosen token budget. The two thinking-on
runs in this lab differ only in that one setting:

```json
{
  "model": "claude-sonnet-5",
  "max_tokens": 4096,
  "messages": [{ "role": "user", "content": "Draft a reply to this GitHub issue. Write a clear, thorough response a maintainer could send as-is, reasoning carefully about the right course of action before answering.\n\nIssue #<n>: <title>\n\n<body>" }],
  "thinking": { "type": "adaptive", "display": "summarized" },
  "output_config": { "effort": "high" }
}
```

`thinking.display` has to be set to `"summarized"` explicitly — the default,
`"omitted"`, still enables thinking but redacts its text, so a call left at
the default returns empty `thinking` blocks with nothing readable in them.
The thinking-off run in this comparison sends neither field at all.

## Reading the response

A thinking-on response's `content` array carries one or more `thinking`
blocks ahead of the final `text` block — this lab joins their `thinking` text
together as the "reasoning trace" shown for that run. The thinking-off run's
`content` never has a `thinking` block, so its trace is always empty.

## What to compare

Each column below is one independent, complete call — its own request,
response, latency, and token usage, each with its own inspector-panel trace.
Watch for: whether a visible reasoning trace shows up at all once thinking is
on; whether the higher-effort run's answer reads as more thorough; and how
much latency and output-token cost that thoroughness actually adds.

## Gotcha

Adaptive thinking is incompatible with message prefilling and with a forced
(non-`auto`) `tool_choice`. It also isn't a default-on setting for every
call — it's worth reaching for once evals show plain prompting has plateaued,
since it adds real latency and cost for every call it's turned on for.
