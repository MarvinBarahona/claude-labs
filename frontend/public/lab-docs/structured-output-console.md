By default, Claude's reply is free-form text — great for a lot of things, but
awkward when your code needs to parse the result. `output_config` lets you
constrain a response to a JSON Schema, so the reply is guaranteed to be valid
JSON matching a shape you define, safe to `JSON.parse()` directly.

## A structured-output call

This lab sends the same kind of request as a plain Messages call, but adds an
`output_config` field (this is the actual request the demo below sends, built
from the model picker and free-text box):

```json
{
  "model": "claude-sonnet-5",
  "max_tokens": 4096,
  "messages": [{ "role": "user", "content": "<your free text>" }],
  "output_config": {
    "format": {
      "type": "json_schema",
      "schema": {
        "type": "object",
        "properties": {
          "summary": { "type": "string" },
          "sentiment": { "type": "string", "enum": ["positive", "neutral", "negative"] },
          "actionItems": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["summary", "sentiment", "actionItems"],
        "additionalProperties": false
      }
    }
  }
}
```

Reach for this whenever a caller needs to parse the reply programmatically —
it's a stronger guarantee than asking the model to "reply in JSON" in a
prompt, since the API enforces the shape rather than merely being asked to
produce it.

## The response

The reply still arrives as a normal `text` content block — `output_config`
doesn't change the response envelope, only what's inside that block. The
guarantee is that its text is JSON matching your schema, so this lab parses
it with a plain `JSON.parse()` and renders the resulting `summary`,
`sentiment`, and `actionItems` fields directly, with no extraction or
cleanup step needed. Watch the inspector panel below the demo after
running it — it shows the exact request and response JSON for the call
that ran, including `usage` and `stop_reason`.

## Gotcha

`output_config` is a separate mechanism from tool use's `input_schema` —
don't confuse the two. Tool schemas describe arguments the model wants to
*call* something with; `output_config`'s schema constrains the model's own
final reply. They can't be mixed into a single field.
