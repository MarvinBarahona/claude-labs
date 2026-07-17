Tool use lets Claude call functions your own code provides — a weather
lookup, a database query, a GitHub API call — instead of answering from
its own knowledge alone. You describe each tool's name, purpose, and
argument shape; Claude decides on its own whether a turn needs one, and if
so, asks for it by name with structured arguments instead of writing prose.
Your code executes the call and hands the result back, and Claude continues
the turn with that result in hand. This lab runs that whole loop end to end
against two real backend-executed tools.

## A tool-use call

Every call in this lab offers both tools, whatever the question (this is
the actual request the demo below sends, built from the model picker and
free-text box):

```json
{
  "model": "claude-sonnet-5",
  "max_tokens": 4096,
  "messages": [{ "role": "user", "content": "<your question>" }],
  "tools": [
    {
      "name": "get_weather",
      "description": "Get the current weather conditions for a named location.",
      "eager_input_streaming": true,
      "input_schema": {
        "type": "object",
        "properties": {
          "location": { "type": "string", "description": "City or place name, e.g. \"Tokyo\" or \"San Francisco, CA\"" }
        },
        "required": ["location"]
      }
    },
    {
      "name": "get_repo_stats",
      "description": "Get open issue count, latest commit, and latest release for the app's configured GitHub repository.",
      "eager_input_streaming": true,
      "input_schema": { "type": "object", "properties": {}, "additionalProperties": false }
    }
  ]
}
```

Each tool needs a `name`, a plain-language `description` (this is what
Claude actually reads to decide whether the tool is relevant — write it
like documentation, not a label), and an `input_schema` — a JSON Schema for
the arguments Claude should provide. `get_repo_stats` takes no arguments at
all, which is a valid, common shape: an empty `properties` object with no
`required` list is enough for a tool that just needs to be *called*, not
parameterized.

When Claude decides a tool is needed, the response comes back with
`stop_reason: "tool_use"` and a `tool_use` content block instead of (or
alongside) text — `{ "type": "tool_use", "id": "...", "name": "get_weather",
"input": { "location": "Tokyo" } }`. That's a request *to your code*, not an
answer to the user; nothing has actually been looked up yet.

## Closing the loop

This lab executes the requested tool server-side — `get_weather` calls the
Open-Meteo API, `get_repo_stats` calls three GitHub REST endpoints — then
sends a new request with the tool's result appended as a `tool_result`
block in a fresh `user` message, alongside the assistant's own `tool_use`
turn:

```json
{ "role": "assistant", "content": [{ "type": "tool_use", "id": "toolu_1", "name": "get_weather", "input": { "location": "Tokyo" } }] },
{ "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "toolu_1", "content": "{\"temperatureC\":18,\"description\":\"Partly cloudy\"}" }] }
```

Claude then continues the turn with that result available — it might
answer directly, or call another tool (this lab's tools can be chained: a
question touching both weather and the repo triggers two round trips
before a final answer). The loop repeats until a response comes back with
some `stop_reason` other than `tool_use`. If a lookup fails in a way your
own code can detect — this lab's weather tool for an unrecognized location
— the `tool_result` is marked `"is_error": true` instead of raising an
error out of the call; Claude sees the failure and can adapt its answer
rather than the request itself erroring out. The inspector panel below
shows every intermediate request/response pair from a multi-call loop,
labeled "call 1", "call 2", etc., above the final call.

## Streaming and eager tool-argument streaming

With "Stream response" on, the raw Claude Messages stream events
(`message_start`, `content_block_start`, `content_block_delta`,
`content_block_stop`, `message_delta`, `message_stop`) are forwarded as-is.
Each tool's `"eager_input_streaming": true` makes its argument JSON arrive
incrementally as `input_json_delta` chunks on `content_block_delta`, the
same way text streams in — useful for showing "calling get_weather…" in a
UI before the full arguments are even known, rather than waiting for one
large JSON blob. On top of the raw events, this lab's own `/turn` endpoint
adds a few convenience SSE events around the parts Claude's API doesn't
cover itself: `tool_call_start` and `tool_call_result` bracket each
server-side tool execution, and `turn_complete` carries the same envelope
the non-streaming response returns, once the whole loop (every call, every
tool) has finished.

## Gotcha

A tool call is not an answer — `stop_reason: "tool_use"` means Claude is
mid-turn, waiting on your code, not done. Rendering `tool_use` content as
if it were the final reply (or stopping after the first call in a
streamed loop) will show a user a request for data instead of the data
itself. Always continue the loop until `stop_reason` is something else.
