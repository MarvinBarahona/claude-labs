The Messages API is the base every other Claude feature builds on: you send a
model, a list of turns, and get back one assistant turn. Everything else in
this app — tool use, thinking, caching, vision — is this same request shape
with extra fields added. This lab exercises the plain form.

## A basic Messages call

A minimal call looks like this (this is the actual request the demo below
sends, built from the model picker, system-prompt box, temperature slider,
and running message list):

```json
{
  "model": "claude-sonnet-5",
  "max_tokens": 4096,
  "system": "You are a terse assistant.",
  "temperature": 0.7,
  "messages": [
    { "role": "user", "content": "What's the capital of France?" }
  ]
}
```

`messages` alternates `user`/`assistant` turns — each new call resends the
whole conversation so far, since the API itself is stateless. `system` is a
separate top-level field, not a message with `role: "system"`. `max_tokens` is
required on every call; there's no server-side default.

The response carries the assistant's reply as a list of content blocks (in
this lab, always a single `text` block), plus a `stop_reason` (why generation
stopped — `end_turn`, `max_tokens`, etc.) and a `usage` object with
`input_tokens`/`output_tokens`. Watch the inspector panel below the demo after
sending a message — it shows the exact request and response JSON for whichever
call ran last.

## Streaming

Toggling "Stream response" sends the same body with one added field,
`"stream": true`, and switches the response from a single JSON object to a
Server-Sent Events (SSE) stream — one event per line, `event: <type>` followed
by `data: <json>`. The events that matter most:

- `message_start` — the envelope for the turn, but its own `content` is
  always empty; you don't get real text here.
- `content_block_start` / `content_block_delta` — a content block begins,
  then streams in incrementally. For text, each delta looks like
  `{ "type": "text_delta", "text": "…" }` — concatenate these to build up the
  reply as it arrives.
- `message_delta` — carries the final `stop_reason` and updated `usage` once
  generation finishes.

A common mistake is reading `message_start.message.content` expecting the
full reply — it's always `[]`. The text only exists once you've accumulated
every `content_block_delta` yourself, in order, by block index.

## Gotcha

A streamed call and a non-streamed call for the same turn produce different
wire formats but the same final envelope — this lab reconstructs a full
response object from the accumulated stream events once the stream ends, so
the inspector panel's final request/response/usage/stop-reason display looks
identical either way. If you're building your own client, you still have to
do that reconstruction yourself; the SDK doesn't hand you a ready-made
`Message` object mid-stream.
